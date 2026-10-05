[CmdletBinding()]
param(
    [ValidateSet("prepare", "production")]
    [string]$Mode = "prepare",

    [string]$Message,

    [switch]$NoPullRequest,

    [string]$RenderServiceId = $env:INVENTORY_RENDER_SERVICE_ID,

    [string]$AppUrl = $env:INVENTORY_PUBLIC_APP_URL,

    [string]$ApiUrl = $env:INVENTORY_PUBLIC_API_URL,

    [int]$RenderTimeoutMinutes = 20
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $repoRoot

if ([string]::IsNullOrWhiteSpace($AppUrl)) {
    $AppUrl = "https://inventariolpe.vercel.app"
}

if ([string]::IsNullOrWhiteSpace($ApiUrl)) {
    $ApiUrl = "https://inventory-api-6o8h.onrender.com"
}

function Assert-Command {
    param([Parameter(Mandatory = $true)][string]$Name)

    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Comando nao encontrado: $Name"
    }
}

function Invoke-Checked {
    param(
        [Parameter(Mandatory = $true)][string]$Tool,
        [string[]]$Arguments = @()
    )

    Write-Host (">>> " + $Tool + " " + ($Arguments -join " ")) -ForegroundColor DarkGray
    & $Tool @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Falha no comando: $Tool (exit code $LASTEXITCODE)"
    }
}

function Invoke-JsonCommand {
    param(
        [Parameter(Mandatory = $true)][string]$Tool,
        [string[]]$Arguments = @()
    )

    $raw = @(& $Tool @Arguments 2>&1)
    if ($LASTEXITCODE -ne 0) {
        throw (($raw -join [Environment]::NewLine).Trim())
    }

    $jsonText = $raw -join [Environment]::NewLine
    if ([string]::IsNullOrWhiteSpace($jsonText)) {
        return $null
    }

    return ($jsonText | ConvertFrom-Json)
}

function Invoke-Pnpm {
    param([string[]]$Arguments = @())

    $versionOutput = @(& pnpm --version 2>$null)
    $version = if ($versionOutput.Count -gt 0) { $versionOutput[-1].ToString().Trim() } else { "" }
    if ($version -eq "10.15.1") {
        Invoke-Checked -Tool "pnpm" -Arguments $Arguments
        return
    }

    Invoke-Checked -Tool "pnpm" -Arguments (@("dlx", "pnpm@10.15.1") + $Arguments)
}

function Get-CurrentBranch {
    return (& git branch --show-current).Trim()
}

function Get-StatusLines {
    return @(& git status --porcelain=v1)
}

function Assert-NoSensitivePaths {
    param([string[]]$Paths)

    $sensitivePaths = @(
        $Paths | Where-Object {
            $normalized = $_ -replace "\\", "/"
            $isEnvFile = $normalized -match "(^|/)\.env($|\.)"
            $isEnvExample = $normalized -match "(^|/)\.env\.example$"
            $isPrivateKey = $normalized -match "(^|/).+\.(pem|key|p12|pfx|kdbx)$"
            ($isEnvFile -and -not $isEnvExample) -or $isPrivateKey
        }
    )

    if ($sensitivePaths.Count -gt 0) {
        & git reset | Out-Null
        throw ("Arquivos potencialmente sensiveis foram bloqueados: " + ($sensitivePaths -join ", "))
    }
}

function Ensure-LocalDependencies {
    Assert-Command -Name "pnpm"
    Assert-Command -Name "python"

    Invoke-Pnpm -Arguments @("install", "--frozen-lockfile")

    $pythonExecutable = Join-Path $repoRoot "backend\.venv\Scripts\python.exe"
    if (-not (Test-Path -LiteralPath $pythonExecutable)) {
        Invoke-Checked -Tool "python" -Arguments @("-m", "venv", "backend/.venv")
    }

    Invoke-Checked -Tool $pythonExecutable -Arguments @("-m", "pip", "install", "-r", "backend/requirements.txt")
    return $pythonExecutable
}

function Invoke-LocalGates {
    $pythonExecutable = Ensure-LocalDependencies
    $previousCi = $env:CI
    $env:CI = "1"

    try {
        Invoke-Pnpm -Arguments @("lint")
        Invoke-Pnpm -Arguments @("typecheck")
        Invoke-Pnpm -Arguments @("test")
        Invoke-Checked -Tool $pythonExecutable -Arguments @("-m", "pytest", "backend/tests", "-q")
        Invoke-Pnpm -Arguments @("build")
        Invoke-Pnpm -Arguments @("exec", "playwright", "install", "chromium")
        Invoke-Pnpm -Arguments @("e2e")
        Invoke-Checked -Tool "git" -Arguments @("diff", "--check")
    }
    finally {
        if ($null -eq $previousCi) {
            Remove-Item Env:CI -ErrorAction SilentlyContinue
        }
        else {
            $env:CI = $previousCi
        }
    }
}

function New-DeployBranch {
    param([Parameter(Mandatory = $true)][string]$CommitMessage)

    $slug = ($CommitMessage.ToLowerInvariant() -replace "[^a-z0-9]+", "-").Trim("-")
    if ([string]::IsNullOrWhiteSpace($slug)) {
        $slug = "release"
    }
    if ($slug.Length -gt 48) {
        $slug = $slug.Substring(0, 48).Trim("-")
    }

    $branch = "codex/deploy-$slug"
    & git show-ref --verify --quiet ("refs/heads/" + $branch)
    if ($LASTEXITCODE -eq 0) {
        $branch = $branch + "-" + (Get-Date -Format "yyyyMMddHHmmss")
    }

    Invoke-Checked -Tool "git" -Arguments @("switch", "-c", $branch)
    return $branch
}

function Open-PullRequest {
    param([Parameter(Mandatory = $true)][string]$Branch, [Parameter(Mandatory = $true)][string]$CommitMessage)

    Assert-Command -Name "gh"
    $openPrs = @(Invoke-JsonCommand -Tool "gh" -Arguments @("pr", "list", "--head", $Branch, "--base", "main", "--state", "open", "--json", "url,number"))
    if ($openPrs.Count -gt 0) {
        Write-Host ("PR existente: " + $openPrs[0].url) -ForegroundColor Green
        return
    }

    $body = @"
Entrega preparada pela automacao local de deploy.

- Quality gates locais executados antes do commit.
- Branch enviada para revisao contra main.
- Deploy de producao permanece condicionado ao merge aprovado e aos checks obrigatorios.
"@

    Invoke-Checked -Tool "gh" -Arguments @(
        "pr", "create", "--base", "main", "--head", $Branch,
        "--title", $CommitMessage, "--body", $body
    )
}

function Prepare-Release {
    if ([string]::IsNullOrWhiteSpace($Message)) {
        throw "Informe -Message, por exemplo: -Message 'feat: atualizar fluxo de sincronizacao'"
    }

    $branch = Get-CurrentBranch
    if ([string]::IsNullOrWhiteSpace($branch)) {
        throw "O checkout esta em detached HEAD; crie uma branch antes de preparar a entrega."
    }
    if ($branch -eq "main") {
        $branch = New-DeployBranch -CommitMessage $Message
    }

    $statusBefore = @(Get-StatusLines)
    if ($statusBefore.Count -eq 0) {
        throw "Nao ha alteracoes para comitar."
    }

    Invoke-LocalGates

    Invoke-Checked -Tool "git" -Arguments @("add", "--all")
    $stagedPaths = @(git diff --cached --name-only)
    Assert-NoSensitivePaths -Paths $stagedPaths
    if ($stagedPaths.Count -eq 0) {
        throw "Nenhum arquivo foi preparado para o commit."
    }

    Invoke-Checked -Tool "git" -Arguments @("diff", "--cached", "--check")
    Invoke-Checked -Tool "git" -Arguments @("commit", "-m", $Message)
    Invoke-Checked -Tool "git" -Arguments @("push", "--set-upstream", "origin", $branch)

    if (-not $NoPullRequest) {
        Open-PullRequest -Branch $branch -CommitMessage $Message
    }

    Write-Host "Entrega preparada. Aguarde aprovacao e merge do PR antes do modo production." -ForegroundColor Green
}

function Get-GitHubRunList {
    param([Parameter(Mandatory = $true)][string]$Workflow)

    Assert-Command -Name "gh"
    return @(Invoke-JsonCommand -Tool "gh" -Arguments @(
        "run", "list", "--workflow", $Workflow, "--branch", "main", "--limit", "20",
        "--json", "databaseId,headSha,status,conclusion,event,createdAt,updatedAt"
    ))
}

function Wait-ForVercel {
    param([Parameter(Mandatory = $true)][string]$CommitSha)

    $deadline = (Get-Date).ToUniversalTime().AddMinutes(15)
    while ((Get-Date).ToUniversalTime() -lt $deadline) {
        $commitStatus = Invoke-JsonCommand -Tool "gh" -Arguments @(
            "api", ("repos/samuelperdigao/INVENTARIO/commits/" + $CommitSha + "/status")
        )
        $vercelStatuses = @($commitStatus.statuses | Where-Object { $_.context -match "^Vercel($| )" })
        $success = @($vercelStatuses | Where-Object { $_.state -eq "success" })
        $failure = @($vercelStatuses | Where-Object { $_.state -in @("failure", "error") })

        if ($failure.Count -gt 0) {
            throw "O deployment da Vercel falhou: $($failure[0].description)"
        }
        if ($success.Count -gt 0) {
            Write-Host "Vercel confirmou o deployment do commit $CommitSha." -ForegroundColor Green
            return
        }

        Write-Host "Aguardando status da Vercel..." -ForegroundColor DarkYellow
        Start-Sleep -Seconds 10
    }

    throw "A Vercel nao confirmou o deployment dentro do tempo limite."
}

function Wait-ForRenderDeploy {
    param(
        [Parameter(Mandatory = $true)][string]$CommitSha,
        [Parameter(Mandatory = $true)][string]$ServiceId,
        [Parameter(Mandatory = $true)][string]$ApiKey
    )

    $headers = @{
        Authorization = "Bearer $ApiKey"
        Accept = "application/json"
    }
    $payload = @{ commitId = $CommitSha; clearCache = "do_not_clear" } | ConvertTo-Json -Compress
    $deploy = Invoke-RestMethod -Method Post -Uri ("https://api.render.com/v1/services/" + $ServiceId + "/deploys") -Headers $headers -ContentType "application/json" -Body $payload
    $deployId = [string]$deploy.id
    if ([string]::IsNullOrWhiteSpace($deployId)) {
        throw "O Render nao retornou o ID do deploy."
    }

    Write-Host ("Deploy Render iniciado: " + $deployId) -ForegroundColor DarkYellow
    $deadline = (Get-Date).ToUniversalTime().AddMinutes($RenderTimeoutMinutes)
    $lastStatus = ""
    while ((Get-Date).ToUniversalTime() -lt $deadline) {
        $current = Invoke-RestMethod -Method Get -Uri ("https://api.render.com/v1/services/" + $ServiceId + "/deploys/" + $deployId) -Headers $headers
        $status = [string]$current.status
        if ($status -ne $lastStatus) {
            Write-Host ("Render: " + $status)
            $lastStatus = $status
        }

        if ($status -eq "live") {
            if ([string]$current.commit.id -ne $CommitSha) {
                throw "O Render ficou live em uma revisao diferente da solicitada."
            }
            Write-Host "Render confirmou o deployment correto como live." -ForegroundColor Green
            return
        }
        if ($status -match "failed|canceled|deactivated|error") {
            throw "O deploy Render terminou com status: $status"
        }

        Start-Sleep -Seconds 10
    }

    throw "O Render nao ficou live dentro do tempo limite."
}

function Assert-Health {
    param([Parameter(Mandatory = $true)][string]$Uri)

    $response = Invoke-RestMethod -Method Get -Uri $Uri -TimeoutSec 30
    if ([string]$response.status -ne "ok") {
        throw ("Healthcheck invalido em " + $Uri)
    }
    Write-Host ("Healthcheck OK: " + $Uri) -ForegroundColor Green
}

function Wait-ForSmokeRun {
    param([Parameter(Mandatory = $true)][DateTimeOffset]$StartedAt)

    $deadline = [DateTimeOffset]::UtcNow.AddMinutes(5)
    while ([DateTimeOffset]::UtcNow -lt $deadline) {
        $runs = Get-GitHubRunList -Workflow "production-smoke.yml"
        $candidate = @(
            $runs |
                Where-Object {
                    $_.headSha -eq $script:headSha -and
                    $_.event -eq "workflow_dispatch" -and
                    [DateTimeOffset]::Parse($_.createdAt) -ge $StartedAt.AddSeconds(-5)
                } |
                Sort-Object createdAt -Descending
        )
        if ($candidate.Count -gt 0) {
            return $candidate[0]
        }
        Start-Sleep -Seconds 5
    }

    throw "Nao foi possivel localizar o run manual do Production Smoke."
}

function Deploy-Production {
    Assert-Command -Name "git"
    Assert-Command -Name "gh"

    $branch = Get-CurrentBranch
    if ($branch -ne "main") {
        throw "O modo production so pode ser executado na main apos o merge aprovado. Branch atual: $branch"
    }
    if ((@(Get-StatusLines)).Count -gt 0) {
        throw "A main precisa estar limpa antes do deploy de producao."
    }
    if ([string]::IsNullOrWhiteSpace($RenderServiceId)) {
        throw "Defina INVENTORY_RENDER_SERVICE_ID no ambiente local."
    }
    if ([string]::IsNullOrWhiteSpace($env:RENDER_API_KEY)) {
        throw "Defina RENDER_API_KEY no ambiente local; nunca coloque o token no repositorio."
    }

    Invoke-Checked -Tool "git" -Arguments @("fetch", "origin")
    $script:headSha = (& git rev-parse HEAD).Trim()
    $originSha = (& git rev-parse origin/main).Trim()
    if ($script:headSha -ne $originSha) {
        throw "A main local nao esta sincronizada com origin/main. Atualize por fast-forward antes do deploy."
    }

    $gateRuns = Get-GitHubRunList -Workflow "quality-gates.yml"
    $gate = @(
        $gateRuns |
            Where-Object { $_.headSha -eq $script:headSha -and $_.status -eq "completed" -and $_.conclusion -eq "success" } |
            Sort-Object updatedAt -Descending
    )
    if ($gate.Count -eq 0) {
        throw "Nao ha Quality Gates aprovado para o commit $script:headSha."
    }

    Wait-ForVercel -CommitSha $script:headSha
    Wait-ForRenderDeploy -CommitSha $script:headSha -ServiceId $RenderServiceId -ApiKey $env:RENDER_API_KEY
    Assert-Health -Uri ($ApiUrl.TrimEnd("/") + "/healthz")
    Assert-Health -Uri ($AppUrl.TrimEnd("/") + "/backend-api/healthz")

    $smokeStartedAt = [DateTimeOffset]::UtcNow
    Invoke-Checked -Tool "gh" -Arguments @("workflow", "run", ".github/workflows/production-smoke.yml", "--ref", "main")
    $smokeRun = Wait-ForSmokeRun -StartedAt $smokeStartedAt
    Invoke-Checked -Tool "gh" -Arguments @("run", "watch", ([string]$smokeRun.databaseId), "--exit-status")

    Write-Host "Deploy completo: Vercel, Render, healthchecks e Production Smoke aprovados." -ForegroundColor Green
}

try {
    Assert-Command -Name "git"

    if ($Mode -eq "prepare") {
        Prepare-Release
    }
    else {
        Deploy-Production
    }
}
catch {
    Write-Error $_
    exit 1
}
