import { spawn } from "node:child_process";

const baseUrl = "http://localhost:3004";
const cropsUrl = `${baseUrl}/api/crops`;

let response;
try {
  response = await fetch(cropsUrl, { signal: AbortSignal.timeout(2000) });
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

if (response && !response.ok) {
  console.error(`SmartFarm API check failed with HTTP ${response.status}`);
  process.exit(1);
}

if (response) {
  const crops = await response.json();
  if (!Array.isArray(crops)) {
    console.error("SmartFarm API returned an invalid Crop Cards response");
    process.exit(1);
  }

  const probeUrl =
    crops.length > 0
      ? `${baseUrl}/api/crops/${crops[0].id}`
      : `${baseUrl}/api/crops/0`;
  const probe = await fetch(probeUrl, { signal: AbortSignal.timeout(2000) });
  if (
    (crops.length > 0 && (!probe.ok || (await probe.json()).id !== crops[0].id)) ||
    (crops.length === 0 && probe.status !== 400)
  ) {
    console.error(
      "The SmartFarm API is running but does not support the current Crop Card ID routes. Restart the API process.",
    );
    process.exit(1);
  }

  console.log("SmartFarm API listening on port 3004");
}
