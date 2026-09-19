import { spawn, spawnSync } from "node:child_process";

const environment = {
  ...process.env,
  BACKEND_PROXY_URL: "http://127.0.0.1:8000",
  NEXT_PUBLIC_ANALYSIS_API_BASE_URL: "/backend-api",
  NEXT_PUBLIC_SYNC_API_BASE_URL: "/backend-api",
};
const nextCli = "node_modules/next/dist/bin/next";

const build = spawnSync(process.execPath, [nextCli, "build", "--webpack"], {
  cwd: process.cwd(),
  env: environment,
  stdio: "inherit",
});
if (build.status !== 0) process.exit(build.status ?? 1);

const server = spawn(process.execPath, [nextCli, "start", "-H", "127.0.0.1"], {
  cwd: process.cwd(),
  env: environment,
  stdio: "inherit",
});

function forwardSignal(signal) {
  if (!server.killed) server.kill(signal);
}

process.on("SIGINT", () => forwardSignal("SIGINT"));
process.on("SIGTERM", () => forwardSignal("SIGTERM"));
server.on("exit", (code) => process.exit(code ?? 1));
