import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const prismaCli = path.join(repositoryRoot, "node_modules", "prisma", "build", "index.js");
const migrationScript = path.join(repositoryRoot, "scripts", "migrate-database.mjs");

function fixtureName(label) {
  return `phase3-${label}-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.db`;
}

function databasePath(filename) {
  return path.join(repositoryRoot, "prisma", "prisma", filename);
}

function fixtureEnvironment(filename, backupDirectory) {
  return {
    ...process.env,
    DATABASE_URL: `file:./prisma/${filename}`,
    FOUNDRY_DATABASE_BACKUP_DIR: backupDirectory,
  };
}

function run(command, args, environment) {
  try {
    return execFileSync(command, args, {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: environment,
      stdio: "pipe",
      windowsHide: true,
    });
  } catch (error) {
    const output = `${error.stdout ?? ""}${error.stderr ?? ""}`.trim();
    throw new Error(output || (error instanceof Error ? error.message : "Subprocess failed."));
  }
}

function runPrisma(args, environment) {
  return run(process.execPath, [prismaCli, ...args], environment);
}

function runMigration(environment) {
  return run(process.execPath, [migrationScript], environment);
}

function expectPrismaFailure(args, environment, expectedMessage) {
  assert.throws(
    () => runPrisma(args, environment),
    (error) => {
      const output = `${error.stdout ?? ""}${error.stderr ?? ""}${
        error instanceof Error ? error.message : ""
      }`;
      return expectedMessage.test(output);
    },
  );
}

function writeSql(directory, filename, contents) {
  const sqlPath = path.join(directory, filename);
  writeFileSync(sqlPath, contents, "utf8");
  return sqlPath;
}

function cleanup(filename, backupDirectory) {
  for (const suffix of ["", "-journal", "-shm", "-wal"]) {
    rmSync(`${databasePath(filename)}${suffix}`, { force: true });
  }

  rmSync(backupDirectory, { force: true, recursive: true });
}

function verifyFreshInstall() {
  const filename = fixtureName("fresh");
  const backupDirectory = mkdtempSync(path.join(os.tmpdir(), "foundry-phase3-fresh-"));
  const environment = fixtureEnvironment(filename, backupDirectory);

  try {
    assert.match(runMigration(environment), /Created a fresh SQLite database and applied migrations/);
    assert.match(
      runPrisma(["migrate", "status", "--schema", "prisma/schema.prisma"], environment),
      /Database schema is up to date/,
    );
    run(
      process.execPath,
      ["--import", "tsx", "--test", "tests/publishing/publish-attempts.integration.ts"],
      environment,
    );
    run(
      process.execPath,
      ["--import", "tsx", "--test", "tests/sync/wordpress-sync.integration.ts"],
      environment,
    );

    const setupSql = writeSql(
      backupDirectory,
      "setup.sql",
      [
        "PRAGMA foreign_keys=OFF;",
        "INSERT INTO TopicClusterItem (id, topicClusterId, itemType, sitePostId, label, sortOrder, createdAt) VALUES ('valid-cluster-item', 'cluster-1', 'SITE_POST', 'site-post-1', 'Valid', 0, CURRENT_TIMESTAMP);",
      ].join("\n"),
    );
    runPrisma(["db", "execute", "--schema", "prisma/schema.prisma", "--file", setupSql], environment);

    const invalidClusterSql = writeSql(
      backupDirectory,
      "invalid-cluster.sql",
      [
        "PRAGMA foreign_keys=OFF;",
        "INSERT INTO TopicClusterItem (id, topicClusterId, itemType, articleId, label, sortOrder, createdAt) VALUES ('invalid-cluster-item', 'cluster-1', 'SITE_POST', 'article-1', 'Invalid', 0, CURRENT_TIMESTAMP);",
      ].join("\n"),
    );
    expectPrismaFailure(
      ["db", "execute", "--schema", "prisma/schema.prisma", "--file", invalidClusterSql],
      environment,
      /CHECK constraint failed/i,
    );

    const duplicateClusterSql = writeSql(
      backupDirectory,
      "duplicate-cluster.sql",
      [
        "PRAGMA foreign_keys=OFF;",
        "INSERT INTO TopicClusterItem (id, topicClusterId, itemType, sitePostId, label, sortOrder, createdAt) VALUES ('duplicate-cluster-item', 'cluster-1', 'SITE_POST', 'site-post-1', 'Duplicate', 0, CURRENT_TIMESTAMP);",
      ].join("\n"),
    );
    expectPrismaFailure(
      ["db", "execute", "--schema", "prisma/schema.prisma", "--file", duplicateClusterSql],
      environment,
      /UNIQUE constraint failed/i,
    );

    const invalidSimilarSql = writeSql(
      backupDirectory,
      "invalid-similar.sql",
      [
        "PRAGMA foreign_keys=OFF;",
        "INSERT INTO OpportunitySimilarPost (id, opportunityId, source, title, status, similarity, reason, createdAt) VALUES ('invalid-similar', 'opportunity-1', 'site', 'Invalid', 'publish', 50, 'Invalid relation', CURRENT_TIMESTAMP);",
      ].join("\n"),
    );
    expectPrismaFailure(
      ["db", "execute", "--schema", "prisma/schema.prisma", "--file", invalidSimilarSql],
      environment,
      /CHECK constraint failed/i,
    );
  } finally {
    cleanup(filename, backupDirectory);
  }
}

function verifyLegacyBaseline() {
  const filename = fixtureName("legacy");
  const backupDirectory = mkdtempSync(path.join(os.tmpdir(), "foundry-phase3-legacy-"));
  const environment = fixtureEnvironment(filename, backupDirectory);

  try {
    writeFileSync(databasePath(filename), "", { flag: "wx" });
    runPrisma(["db", "push", "--schema", "prisma/schema.prisma", "--skip-generate"], environment);
    assert.match(runMigration(environment), /Existing database matches the checked-in migration history/);
    assert.equal(readdirSync(backupDirectory).length, 1);
    assert.match(
      runPrisma(["migrate", "status", "--schema", "prisma/schema.prisma"], environment),
      /Database schema is up to date/,
    );
    assert.match(runMigration(environment), /Database migrations are already up to date/);
    assert.equal(readdirSync(backupDirectory).length, 1);
  } finally {
    cleanup(filename, backupDirectory);
  }
}

try {
  verifyFreshInstall();
  verifyLegacyBaseline();
  console.log("[foundry] Migration verification passed for fresh and legacy SQLite databases.");
} catch (error) {
  console.error(`[foundry] Migration verification failed: ${error instanceof Error ? error.message : "Unknown error"}`);
  process.exitCode = 1;
}
