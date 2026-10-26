import { createServer } from "node:http";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createCropCard,
  cropDatabase,
  deleteCropCard,
  getCropCard,
  getSensorReadings,
  listCropCards,
  updateCropCard,
} from "./db.js";

const port = Number(process.env.PORT ?? 3001);
const jsonHeaders = { "Content-Type": "application/json; charset=utf-8" };
const maximumBodySize = 16 * 1024;

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, jsonHeaders);
  response.end(JSON.stringify(body));
}

async function readRequestBody(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > maximumBodySize) {
      const error = new Error("Request body is too large");
      error.statusCode = 413;
      throw error;
    }
  }

  try {
    return JSON.parse(body);
  } catch {
    const error = new Error("Request body must be valid JSON");
    error.statusCode = 400;
    throw error;
  }
}

function validateCropProfile(body, cropName) {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return "Request body must be a crop profile object";
  }
  if (typeof cropName !== "string" || cropName.trim().length === 0) {
    return "crop_name must not be empty";
  }

  const textFields = [
    ["location", 120],
    ["normalWaterUnit", 40],
    ["notes", 2000],
  ];
  for (const [field, maximumLength] of textFields) {
    if (
      typeof body[field] !== "string" ||
      body[field].length > maximumLength
    ) {
      return `${field} must be a string no longer than ${maximumLength} characters`;
    }
  }

  const numericFields = [
    ["targetMoistureMin", 0, 100],
    ["targetMoistureMax", 0, 100],
    ["normalWaterAmount", 0, Number.MAX_SAFE_INTEGER],
  ];
  for (const [field, minimum, maximum] of numericFields) {
    if (
      typeof body[field] !== "number" ||
      !Number.isFinite(body[field]) ||
      body[field] < minimum ||
      body[field] > maximum
    ) {
      return `${field} must be a number between ${minimum} and ${maximum}`;
    }
  }
  if (body.targetMoistureMin > body.targetMoistureMax) {
    return "targetMoistureMin must not exceed targetMoistureMax";
  }

  return null;
}

function getFeedCropNames(readings) {
  if (!Array.isArray(readings)) {
    throw new Error("The sensor feed must be a JSON array");
  }
  return [
    ...new Set(
      readings
        .filter(
          (reading) =>
            reading !== null &&
            typeof reading === "object" &&
            typeof reading.crop_name === "string" &&
            reading.crop_name.trim().length > 0,
        )
        .map((reading) => reading.crop_name),
    ),
  ].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

export function createApiServer({
  database = cropDatabase,
  readReadings = getSensorReadings,
} = {}) {
  return createServer(async (request, response) => {
    const url = new URL(request.url, "http://localhost");
    const { pathname } = url;

    try {
      if (pathname === "/api/readings" && request.method === "GET") {
        const readings = await readReadings();
        if (!Array.isArray(readings)) {
          sendJson(response, 500, { error: "The sensor feed must be a JSON array" });
          return;
        }
        sendJson(response, 200, readings);
        return;
      }

      if (pathname === "/api/crops" && request.method === "GET") {
        sendJson(response, 200, listCropCards(database));
        return;
      }

      if (pathname === "/api/crop-options" && request.method === "GET") {
        const readings = await readReadings();
        const existingCropNames = new Set(
          listCropCards(database).map((crop) => crop.crop_name),
        );
        const options = getFeedCropNames(readings).filter(
          (cropName) => !existingCropNames.has(cropName),
        );
        sendJson(response, 200, options);
        return;
      }

      if (pathname === "/api/crops" && request.method === "POST") {
        const body = await readRequestBody(request);
        const cropName = body?.cropName;
        const validationError = validateCropProfile(body, cropName);
        if (validationError) {
          sendJson(response, 400, { error: validationError });
          return;
        }

        const readings = await readReadings();
        if (!getFeedCropNames(readings).includes(cropName)) {
          sendJson(response, 400, {
            error: "Crop name must exactly match a crop in the sensor feed",
          });
          return;
        }
        if (getCropCard(cropName, database)) {
          sendJson(response, 409, { error: "A crop card already exists" });
          return;
        }

        createCropCard(
          {
            ...body,
            cropName,
          },
          database,
        );
        sendJson(response, 201, getCropCard(cropName, database));
        return;
      }

      const cropMatch = pathname.match(/^\/api\/crops\/([^/]+)$/);
      if (cropMatch && (request.method === "PUT" || request.method === "DELETE")) {
        let cropName;
        try {
          cropName = decodeURIComponent(cropMatch[1]);
        } catch {
          sendJson(response, 400, { error: "Crop name is not valid URL encoding" });
          return;
        }

        if (!getCropCard(cropName, database)) {
          sendJson(response, 404, { error: "Crop card not found" });
          return;
        }

        if (request.method === "DELETE") {
          deleteCropCard(cropName, database);
          response.writeHead(204);
          response.end();
          return;
        }

        const body = await readRequestBody(request);
        const validationError = validateCropProfile(body, cropName);
        if (validationError) {
          sendJson(response, 400, { error: validationError });
          return;
        }
        updateCropCard(cropName, body, database);
        sendJson(response, 200, getCropCard(cropName, database));
        return;
      }

      sendJson(response, 404, { error: "Not found" });
    } catch (error) {
      if (error.statusCode) {
        sendJson(response, error.statusCode, { error: error.message });
        return;
      }
      console.error("SmartFarm API request failed:", error);
      sendJson(response, 500, { error: "The request could not be completed" });
    }
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const server = createApiServer();
  server.listen(port, () => {
    console.log(`SmartFarm API listening on port ${port}`);
  });
}
