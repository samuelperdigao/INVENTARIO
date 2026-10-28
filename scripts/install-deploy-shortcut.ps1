[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$deployScript = (Resolve-Path (Join-Path $repoRoot "scripts\deploy.ps1")).Path
$profilePath = $PROFILE
$profileDirectory = Split-Path -Parent $profilePath
$markerStart = "# >>> INVENTARIO deploy shortcut >>>"
$markerEnd = "# <<< INVENTARIO deploy shortcut <<<"

if (-not (Test-Path -LiteralPath $profileDirectory)) {
    New-Item -ItemType Directory -Path $profileDirectory -Force | Out-Null
}

if (-not (Test-Path -LiteralPath $profilePath)) {
    New-Item -ItemType File -Path $profilePath -Force | Out-Null
}

$profileContent = Get-Content -LiteralPath $profilePath -Raw
if ($null -eq $profileContent) {
    $profileContent = ""
}

if ($profileContent.Contains($markerStart)) {
    Write-Host "O atalho invdeploy ja esta instalado em: $profilePath" -ForegroundColor Yellow
    Write-Host "Para recarregar nesta janela: . `$PROFILE" -ForegroundColor DarkGray
    exit 0
}

foreach ($commandName in @("invdeploy", "deploy-inventario")) {
    if (Get-Command $commandName -ErrorAction SilentlyContinue) {
        throw "Nao foi possivel instalar o atalho: o comando '$commandName' ja existe nesta sessao."
    }
}

$escapedDeployScript = $deployScript.Replace("'", "''")
$shortcutBlock = @"
$markerStart
function deploy-inventario {
    [CmdletBinding()]
    param(
        [Parameter(ValueFromRemainingArguments = `$true)]
        [object[]]`$Arguments
    )

    `$runner = (Get-Process -Id `$PID).Path
    if ([string]::IsNullOrWhiteSpace(`$runner)) {
        `$runner = (Get-Command pwsh, powershell -ErrorAction SilentlyContinue | Select-Object -First 1).Source
    }
    if ([string]::IsNullOrWhiteSpace(`$runner)) {
        throw "Nao foi possivel localizar o PowerShell para executar o deploy."
    }

    & `$runner -NoLogo -NoProfile -ExecutionPolicy Bypass -File '$escapedDeployScript' -Mode production @Arguments
    `$exitCode = `$LASTEXITCODE
    if (`$exitCode -ne 0) {
        throw "O deploy do INVENTARIO falhou (exit code `$exitCode)."
    }
}

Set-Alias -Name invdeploy -Value deploy-inventario
$markerEnd
"@

$separator = if ([string]::IsNullOrWhiteSpace($profileContent)) { "" } else { "`r`n`r`n" }
Add-Content -LiteralPath $profilePath -Value ($separator + $shortcutBlock) -Encoding utf8

Write-Host "Atalho instalado: invdeploy" -ForegroundColor Green
Write-Host "Funcao equivalente: deploy-inventario" -ForegroundColor Green
Write-Host "Perfil atualizado: $profilePath" -ForegroundColor DarkGray
Write-Host "Feche e abra o PowerShell, ou execute: . `$PROFILE" -ForegroundColor DarkGray
