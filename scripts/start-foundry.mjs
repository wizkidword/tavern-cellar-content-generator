import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationScript = path.join(scriptsDirectory, "migrate-database.mjs");
const launcherScript = path.join(scriptsDirectory, "run-foundry.mjs");

const migration = spawnSync(process.execPath, [migrationScript], { stdio: "inherit" });

if (migration.status !== 0) {
  process.exitCode = migration.status ?? 1;
} else {
  const launcher = spawn(process.execPath, [launcherScript, "start", ...process.argv.slice(2)], {
    stdio: "inherit",
  });

  launcher.on("error", (error) => {
    console.error(`[foundry] Unable to start Next.js: ${error.message}`);
    process.exitCode = 1;
  });

  launcher.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exitCode = code ?? 1;
  });
}
