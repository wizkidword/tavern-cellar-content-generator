import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function collectTestFiles(directory) {
  const entries = readdirSync(directory);
  const files = [];

  for (const entry of entries) {
    const path = join(directory, entry);
    const stats = statSync(path);

    if (stats.isDirectory()) {
      files.push(...collectTestFiles(path));
      continue;
    }

    if (entry.endsWith(".test.ts")) {
      files.push(path);
    }
  }

  return files;
}

const testFiles = collectTestFiles("tests");

if (testFiles.length === 0) {
  console.error("No test files found.");
  process.exit(1);
}

const result = spawnSync(
  process.execPath,
  ["--import", "tsx", "--test", ...testFiles],
  { stdio: "inherit" },
);

process.exit(result.status ?? 1);
