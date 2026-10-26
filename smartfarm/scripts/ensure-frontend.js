import { spawn } from "node:child_process";

const url = "http://localhost:5178/";

try {
  const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
  const html = await response.text();
  if (response.ok && html.includes("<title>SmartFarm Dashboard</title>")) {
    console.log("http://localhost:5178/");
    process.exit(0);
  }

  console.error("Port 5178 is serving an unexpected response");
  process.exit(1);
} catch {
  const npm = spawn("npm", ["--prefix", "smartfarm", "run", "dev"], {
    stdio: "inherit",
  });

  npm.on("error", (error) => {
    console.error("Unable to start SmartFarm frontend:", error);
    process.exitCode = 1;
  });
  npm.on("exit", (code, signal) => {
    if (signal) {
      console.error(`SmartFarm frontend exited after signal ${signal}`);
      process.exitCode = 1;
    } else if (code !== 0) {
      process.exitCode = code ?? 1;
    }
  });
}
