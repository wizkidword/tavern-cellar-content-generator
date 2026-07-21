import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const [command, ...nextArgs] = process.argv.slice(2);

if (command !== "dev" && command !== "start") {
  console.error("[foundry] Expected either the dev or start command.");
  process.exitCode = 1;
} else {
  const loopbackHostnames = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

  function hostnameFromArguments(args) {
    for (let index = 0; index < args.length; index += 1) {
      const argument = args[index];

      if (argument === "--hostname" || argument === "-H") {
        return args[index + 1] ?? null;
      }

      if (argument.startsWith("--hostname=")) {
        return argument.slice("--hostname=".length);
      }
    }

    return "127.0.0.1";
  }

  function requiresRemoteAuthentication() {
    const bindHostname = hostnameFromArguments(nextArgs);
    const appOrigin = process.env.APP_ORIGIN ?? "http://127.0.0.1:3000";
    let appHostname;

    try {
      const parsedOrigin = new URL(appOrigin);

      if (parsedOrigin.protocol !== "http:" && parsedOrigin.protocol !== "https:") {
        throw new Error("APP_ORIGIN must use HTTP or HTTPS.");
      }

      appHostname = parsedOrigin.hostname;
    } catch {
      console.error("[foundry] APP_ORIGIN must be a valid URL before Foundry can start.");
      process.exitCode = 1;
      return false;
    }

    return !loopbackHostnames.has(bindHostname ?? "") || !loopbackHostnames.has(appHostname);
  }

  function hasRequiredOperatorConfiguration() {
    const operatorToken = process.env.FOUNDRY_OPERATOR_TOKEN?.trim() ?? "";
    const sessionSecret = process.env.SESSION_SECRET?.trim() ?? "";

    if (operatorToken.length < 16 || Buffer.byteLength(sessionSecret, "utf8") < 32) {
      console.error(
        "[foundry] Refusing a non-loopback launch without a 16+ character FOUNDRY_OPERATOR_TOKEN and a SESSION_SECRET of at least 32 random bytes.",
      );
      process.exitCode = 1;
      return false;
    }

    return true;
  }

  if (process.exitCode !== 1 && (!requiresRemoteAuthentication() || hasRequiredOperatorConfiguration())) {
    const nextBin = fileURLToPath(new URL("../node_modules/next/dist/bin/next", import.meta.url));
    const child = spawn(process.execPath, [nextBin, command, ...nextArgs], {
      env: process.env,
      stdio: "inherit",
    });

    child.on("error", (error) => {
      console.error(`[foundry] Unable to start Next.js: ${error.message}`);
      process.exitCode = 1;
    });

    child.on("exit", (code, signal) => {
      if (signal) {
        process.kill(process.pid, signal);
        return;
      }

      process.exitCode = code ?? 1;
    });
  }
}
