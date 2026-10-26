import { spawn } from "node:child_process";

const url = "http://localhost:3004/api/crops";

try {
  const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
  if (response.ok) {
    console.log("SmartFarm API listening on port 3004");
    process.exit(0);
  }

  console.error(`SmartFarm API check failed with HTTP ${response.status}`);
  process.exit(1);
} catch {
  const npm = spawn("npm", ["--prefix", "smartfarm", "run", "start:backend"], {
    stdio: "inherit",
  });

  npm.on("error", (error) => {
    console.error("Unable to start SmartFarm API:", error);
    process.exitCode = 1;
  });
  npm.on("exit", (code, signal) => {
    if (signal) {
      console.error(`SmartFarm API exited after signal ${signal}`);
      process.exitCode = 1;
    } else if (code !== 0) {
      process.exitCode = code ?? 1;
    }
  });
}
