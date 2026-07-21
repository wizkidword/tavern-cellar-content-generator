import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const schemaPath = path.join(repositoryRoot, "prisma", "schema.prisma");
export const baselineMigration = "20260721143000_initial_baseline";

function readDotEnvValue(value) {
  const trimmed = value.trim();

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed.replace(/\s+#.*$/, "");
}

export function databaseUrlFromEnvironment(environment = process.env) {
  const configured = environment.DATABASE_URL?.trim();

  if (configured) {
    return configured;
  }

  const envPath = path.join(repositoryRoot, ".env");

  if (!existsSync(envPath)) {
    throw new Error("DATABASE_URL is required. Create .env from .env.example before running database commands.");
  }

  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = /^\s*DATABASE_URL\s*=\s*(.*)$/.exec(line);

    if (match) {
      const value = readDotEnvValue(match[1]);

      if (value) {
        return value;
      }
    }
  }

  throw new Error("DATABASE_URL is required in .env before running database commands.");
}

export function sqliteDatabasePath(databaseUrl) {
  if (!databaseUrl.startsWith("file:")) {
    throw new Error("Foundry migration tooling currently supports only a SQLite file: DATABASE_URL.");
  }

  const encodedPath = databaseUrl.slice("file:".length).split(/[?#]/, 1)[0];

  if (!encodedPath || encodedPath === ":memory:") {
    throw new Error("Foundry migration tooling requires a persistent SQLite database file.");
  }

  const decodedPath = decodeURIComponent(encodedPath).replace(/^\/(?:([A-Za-z]:\/))/, "$1");
  const schemaDirectory = path.dirname(schemaPath);

  return path.resolve(schemaDirectory, decodedPath);
}

export function sqliteFileUrl(databasePath) {
  return `file:${databasePath.replace(/\\/g, "/")}`;
}

export function getDatabaseConfig(environment = process.env) {
  const databaseUrl = databaseUrlFromEnvironment(environment);
  const databasePath = sqliteDatabasePath(databaseUrl);

  return {
    databasePath,
    databaseUrl: sqliteFileUrl(databasePath),
  };
}

export function runPrisma(args, options = {}) {
  const prismaCli = path.join(repositoryRoot, "node_modules", "prisma", "build", "index.js");
  const result = spawnSync(process.execPath, [prismaCli, ...args], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: process.env,
    input: options.input,
  });

  if (result.error) {
    throw result.error;
  }

  return {
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
    status: result.status ?? 1,
  };
}

export function runPrismaChecked(args, options = {}) {
  const result = runPrisma(args, options);

  if (result.status !== 0) {
    throw new Error(`Prisma command failed: prisma ${args.join(" ")}\n${result.output}`);
  }

  return result.output;
}
