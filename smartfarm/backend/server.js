import { createServer } from "node:http";
import { getSensorReadings } from "./db.js";

const port = Number(process.env.PORT ?? 3001);

const server = createServer(async (request, response) => {
  if (request.url !== "/api/readings" || request.method !== "GET") {
    response.writeHead(404, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: "Not found" }));
    return;
  }

  try {
    const readings = await getSensorReadings();
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify(readings));
  } catch (error) {
    console.error("Unable to load sensor readings:", error);
    response.writeHead(500, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: "Unable to load sensor readings" }));
  }
});

server.listen(port, () => {
  console.log(`SmartFarm API listening on port ${port}`);
});
