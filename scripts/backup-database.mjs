import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getDatabaseConfig, repositoryRoot, runPrismaChecked } from "./database-utils.mjs";

function backupDirectoryFromEnvironment() {
  const configured = process.env.FOUNDRY_DATABASE_BACKUP_DIR?.trim();

  return configured
    ? path.resolve(repositoryRoot, configured)
    : path.join(repositoryRoot, "prisma", "backups");
}

function backupFilename() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `foundry-${timestamp}-${process.pid}.db`;
}

function sqliteSqlPath(value) {
  return value.replace(/\\/g, "/").replace(/'/g, "''");
}

export async function createDatabaseBackup() {
  const database = getDatabaseConfig();

  if (!existsSync(database.databasePath)) {
    throw new Error("The SQLite database does not exist yet, so there is nothing to back up.");
  }

  const backupDirectory = backupDirectoryFromEnvironment();
  await mkdir(backupDirectory, { recursive: true });
  const backupPath = path.join(backupDirectory, backupFilename());

  if (existsSync(backupPath)) {
    throw new Error(`Refusing to overwrite an existing database backup: ${backupPath}`);
  }

  runPrismaChecked(
    ["db", "execute", "--url", database.databaseUrl, "--stdin"],
    { input: `VACUUM INTO '${sqliteSqlPath(backupPath)}';` },
  );

  if (!existsSync(backupPath)) {
    throw new Error("Prisma reported a successful backup, but the backup file was not created.");
  }

  return backupPath;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  createDatabaseBackup()
    .then((backupPath) => {
      console.log(`[foundry] Database backup created: ${backupPath}`);
    })
    .catch((error) => {
      console.error(`[foundry] Database backup failed: ${error instanceof Error ? error.message : "Unknown error"}`);
      process.exitCode = 1;
    });
}
