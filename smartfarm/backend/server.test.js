import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { analyzeCropCards } from "../frontend/src/utils/analysis.js";
import { initializeDatabase } from "./db.js";
import { createApiServer } from "./server.js";

const sensorFeed = [
  {
    crop_name: "Tomatoes",
    timestamp: "2026-10-26T09:00:00.000Z",
    soilMoisture: 50,
    sensor_status: "ok",
  },
  {
    crop_name: "Maize",
    timestamp: "2026-10-26T08:00:00.000Z",
    soilMoisture: 25,
    sensor_status: "ok",
  },
  {
    crop_name: "Maize",
    timestamp: "2026-10-26T09:30:00.000Z",
    soilMoisture: 48,
    sensor_status: "ok",
  },
  {
    crop_name: "maize",
    timestamp: "2026-10-26T09:20:00.000Z",
    soilMoisture: 80,
    sensor_status: "ok",
  },
];

const maizeProfile = {
  location: "South field",
  targetMoistureMin: 30,
  targetMoistureMax: 60,
  normalWaterAmount: 2,
  normalWaterUnit: "L/plant/day",
  notes: "Maize profile",
};

test("crop-card API fulfills the add, view, edit, delete, re-add, and refresh flow", async (t) => {
  const database = new DatabaseSync(":memory:");
  initializeDatabase(database);
  const feedSnapshot = structuredClone(sensorFeed);
  const server = createApiServer({
    database,
    readReadings: async () => structuredClone(sensorFeed),
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    database.close();
  });

  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const request = async (path, options) => {
    const response = await fetch(`${baseUrl}${path}`, options);
    const body = response.status === 204 ? null : await response.json();
    return { response, body };
  };
  const post = (path, body) =>
    request(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  const put = (path, body) =>
    request(path, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  const initialCards = await request("/api/crops");
  assert.equal(initialCards.response.status, 200);
  assert.deepEqual(
    initialCards.body.map(({ crop_name }) => crop_name),
    ["Corn", "Lettuce", "Tomatoes"],
  );

  const options = await request("/api/crop-options");
  assert.equal(options.response.status, 200);
  assert.ok(options.body.includes("Maize"));
  assert.ok(options.body.includes("maize"));
  assert.ok(!options.body.includes("Tomatoes"));

  const unavailableCrop = await post("/api/crops", {
    cropName: "Rice",
    ...maizeProfile,
  });
  assert.equal(unavailableCrop.response.status, 400);

  const created = await post("/api/crops", {
    cropName: "Maize",
    ...maizeProfile,
  });
  assert.equal(created.response.status, 201);
  assert.equal(created.body.crop_name, "Maize");
  assert.equal(created.body.location, "South field");

  const duplicate = await post("/api/crops", {
    cropName: "Maize",
    ...maizeProfile,
  });
  assert.equal(duplicate.response.status, 409);

  const readingsAtCreate = await request("/api/readings");
  assert.deepEqual(readingsAtCreate.body, feedSnapshot);
  let savedCards = await request("/api/crops");
  let maize = savedCards.body.find(({ crop_name }) => crop_name === "Maize");
  let [combinedMaize] = analyzeCropCards(
    [
      {
        cropName: maize.crop_name,
        location: maize.location,
        targetMoistureMin: maize.target_moisture_min,
        targetMoistureMax: maize.target_moisture_max,
        normalWaterAmount: maize.normal_water_amount,
        normalWaterUnit: maize.normal_water_unit,
        notes: maize.notes,
      },
    ],
    readingsAtCreate.body,
    Date.parse("2026-10-26T10:00:00.000Z"),
  );
  assert.equal(combinedMaize.moisture, 48);
  assert.equal(combinedMaize.timestamp, Date.parse("2026-10-26T09:30:00.000Z"));
  assert.equal(combinedMaize.status, "Healthy");

  const updatedProfile = {
    ...maizeProfile,
    location: "West field",
    targetMoistureMin: 50,
    targetMoistureMax: 70,
  };
  const updated = await put(
    `/api/crops/${encodeURIComponent("Maize")}`,
    updatedProfile,
  );
  assert.equal(updated.response.status, 200);
  assert.equal(updated.body.location, "West field");
  assert.equal(updated.body.target_moisture_min, 50);
  [maize] = (await request("/api/crops")).body.filter(
    ({ crop_name }) => crop_name === "Maize",
  );
  [combinedMaize] = analyzeCropCards(
    [
      {
        cropName: maize.crop_name,
        location: maize.location,
        targetMoistureMin: maize.target_moisture_min,
        targetMoistureMax: maize.target_moisture_max,
        normalWaterAmount: maize.normal_water_amount,
        normalWaterUnit: maize.normal_water_unit,
        notes: maize.notes,
      },
    ],
    readingsAtCreate.body,
    Date.parse("2026-10-26T10:00:00.000Z"),
  );
  assert.equal(combinedMaize.status, "Dry");

  const deleted = await request(`/api/crops/${encodeURIComponent("Maize")}`, {
    method: "DELETE",
  });
  assert.equal(deleted.response.status, 204);
  assert.ok(!(await request("/api/crops")).body.some((crop) => crop.crop_name === "Maize"));
  assert.deepEqual((await request("/api/readings")).body, feedSnapshot);
  assert.ok((await request("/api/crop-options")).body.includes("Maize"));

  const reCreated = await post("/api/crops", {
    cropName: "Maize",
    ...maizeProfile,
  });
  assert.equal(reCreated.response.status, 201);
  assert.equal(reCreated.body.crop_name, "Maize");
  assert.deepEqual((await request("/api/readings")).body, feedSnapshot);

  const refreshedReadings = await request("/api/readings");
  const refreshedCards = await request("/api/crops");
  assert.equal(refreshedReadings.response.status, 200);
  assert.equal(refreshedCards.response.status, 200);
  const refreshedMaize = refreshedCards.body.find(
    ({ crop_name }) => crop_name === "Maize",
  );
  [combinedMaize] = analyzeCropCards(
    [
      {
        cropName: refreshedMaize.crop_name,
        location: refreshedMaize.location,
        targetMoistureMin: refreshedMaize.target_moisture_min,
        targetMoistureMax: refreshedMaize.target_moisture_max,
        normalWaterAmount: refreshedMaize.normal_water_amount,
        normalWaterUnit: refreshedMaize.normal_water_unit,
        notes: refreshedMaize.notes,
      },
    ],
    refreshedReadings.body,
    Date.parse("2026-10-26T10:00:00.000Z"),
  );
  assert.equal(combinedMaize.moisture, 48);
  assert.equal(combinedMaize.status, "Healthy");
});

test("crop APIs reject invalid moisture ranges and malformed JSON", async (t) => {
  const database = new DatabaseSync(":memory:");
  initializeDatabase(database);
  const server = createApiServer({
    database,
    readReadings: async () => structuredClone(sensorFeed),
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    database.close();
  });

  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const invalidRange = await fetch(`${baseUrl}/api/crops`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      cropName: "Maize",
      ...maizeProfile,
      targetMoistureMin: 80,
      targetMoistureMax: 20,
    }),
  });
  assert.equal(invalidRange.status, 400);

  const malformedJson = await fetch(`${baseUrl}/api/crops`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{",
  });
  assert.equal(malformedJson.status, 400);
});

test("deleted seeded crop cards stay deleted after database initialization", () => {
  const database = new DatabaseSync(":memory:");
  initializeDatabase(database);
  database.prepare("DELETE FROM crop_cards WHERE crop_name = ?").run("Tomatoes");

  initializeDatabase(database);

  assert.equal(
    database
      .prepare("SELECT 1 FROM crop_cards WHERE crop_name = ?")
      .get("Tomatoes"),
    undefined,
  );
  database.close();
});
