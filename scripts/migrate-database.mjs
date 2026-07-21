import { existsSync, readdirSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { createDatabaseBackup } from "./backup-database.mjs";
import {
  baselineMigration,
  getDatabaseConfig,
  runPrisma,
  runPrismaChecked,
} from "./database-utils.mjs";

function baselineIsPending(statusOutput) {
  return statusOutput.includes(baselineMigration) && statusOutput.includes("not yet been applied");
}

function databaseMatchesMigrationHistory(databaseUrl) {
  const result = runPrisma([
    "migrate",
    "diff",
    "--from-url",
    databaseUrl,
    "--to-migrations",
    "prisma/migrations",
    "--exit-code",
  ]);

  return result.status === 0;
}

function checkedInMigrationNames() {
  return readdirSync(path.join("prisma", "migrations"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d+_.+/.test(entry.name))
    .map((entry) => entry.name)
    .sort();
}

async function migrateDatabase() {
  const database = getDatabaseConfig();

  if (!existsSync(database.databasePath)) {
    await mkdir(path.dirname(database.databasePath), { recursive: true });
    await writeFile(database.databasePath, "", { flag: "wx" });
    runPrismaChecked(["migrate", "deploy", "--schema", "prisma/schema.prisma"]);
    console.log("[foundry] Created a fresh SQLite database and applied migrations.");
    return;
  }

  const status = runPrisma(["migrate", "status", "--schema", "prisma/schema.prisma"]);

  if (status.status === 0) {
    console.log("[foundry] Database migrations are already up to date.");
    return;
  }

  if (baselineIsPending(status.output)) {
    if (!databaseMatchesMigrationHistory(database.databaseUrl)) {
      throw new Error(
        "The existing SQLite schema does not match the checked-in migration history. No backup or migration was attempted; inspect the database before continuing.",
      );
    }

    const backupPath = await createDatabaseBackup();
    for (const migrationName of checkedInMigrationNames()) {
      runPrismaChecked([
        "migrate",
        "resolve",
        "--applied",
        migrationName,
        "--schema",
        "prisma/schema.prisma",
      ]);
    }
    console.log(
      `[foundry] Existing database matches the checked-in migration history. Backup created: ${backupPath}`,
    );
  } else {
    const backupPath = await createDatabaseBackup();
    console.log(`[foundry] Backup created before applying pending migrations: ${backupPath}`);
  }

  runPrismaChecked(["migrate", "deploy", "--schema", "prisma/schema.prisma"]);
  console.log("[foundry] Database migrations applied successfully.");
}

migrateDatabase().catch((error) => {
  console.error(`[foundry] Database migration failed: ${error instanceof Error ? error.message : "Unknown error"}`);
  process.exitCode = 1;
});
