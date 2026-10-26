import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { analyzeCropCards } from "../frontend/src/utils/analysis.js";
import { initializeDatabase } from "./db.js";
import { createApiServer } from "./server.js";

const sensorFeed = [
  {
    crop_name: "Tomato",
    timestamp: "2026-10-26T09:00:00.000Z",
    soilMoisture: 60,
    sensor_status: "ok",
  },
  {
    crop_name: "Lettuce",
    timestamp: "2026-10-26T09:10:00.000Z",
    soilMoisture: 70,
    sensor_status: "ok",
  },
  {
    crop_name: "Wheat",
    timestamp: "2026-10-26T09:12:00.000Z",
    soilMoisture: 45,
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
    soilMoisture: 55,
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
  location: "South Field",
  target_min: 50,
  target_max: 70,
  normal_water: 600,
  notes: "",
};

async function createTestApi(t, database, readings = sensorFeed) {
  const server = createApiServer({
    database,
    readReadings: async () => structuredClone(readings),
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
  const sendJson = (method, path, body) =>
    request(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  return {
    request,
    post: (path, body) => sendJson("POST", path, body),
    put: (path, body) => sendJson("PUT", path, body),
  };
}

test("empty database receives exactly the specified three seed crops", () => {
  const database = new DatabaseSync(":memory:");
  initializeDatabase(database);

  const crops = database
    .prepare(
      "SELECT id, crop_name, location, target_min, target_max, normal_water, notes, created_at FROM crops ORDER BY id",
    )
    .all();
  assert.deepEqual(
    crops.map(
      ({
        crop_name,
        location,
        target_min,
        target_max,
        normal_water,
        notes,
      }) => ({
        crop_name,
        location,
        target_min,
        target_max,
        normal_water,
        notes,
      }),
    ),
    [
      {
        crop_name: "Tomato",
        location: "Greenhouse A",
        target_min: 55,
        target_max: 75,
        normal_water: 500,
        notes: "",
      },
      {
        crop_name: "Lettuce",
        location: "Greenhouse B",
        target_min: 60,
        target_max: 80,
        normal_water: 400,
        notes: "",
      },
      {
        crop_name: "Wheat",
        location: "North Field",
        target_min: 35,
        target_max: 55,
        normal_water: 300,
        notes: "",
      },
    ],
  );
  assert.ok(crops.every(({ id, created_at }) => Number.isInteger(id) && created_at));
  assert.equal(crops.some(({ crop_name }) => crop_name === "Maize"), false);
  database.close();
});

test("crop-card API supports exact feed options, create, read, update, delete, and re-create", async (t) => {
  const database = new DatabaseSync(":memory:");
  initializeDatabase(database);
  const feedSnapshot = structuredClone(sensorFeed);
  const api = await createTestApi(t, database);

  const initialCards = await api.request("/api/crops");
  assert.equal(initialCards.response.status, 200);
  assert.deepEqual(
    initialCards.body.map(({ crop_name }) => crop_name),
    ["Lettuce", "Tomato", "Wheat"],
  );
  assert.ok(initialCards.body.every(({ id }) => Number.isInteger(id)));

  const options = await api.request("/api/crop-options");
  assert.equal(options.response.status, 200);
  assert.deepEqual(options.body, ["Maize", "maize"]);

  const created = await api.post("/api/crops", {
    crop_name: "Maize",
    ...Object.fromEntries(
      Object.entries(maizeProfile).filter(([field]) => field !== "notes"),
    ),
  });
  assert.equal(created.response.status, 201);
  assert.equal(created.body.crop_name, "Maize");
  assert.equal(created.body.normal_water, 600);
  assert.equal(created.body.notes, "");
  assert.ok(Number.isInteger(created.body.id));
  assert.ok(created.body.created_at);

  const caseDistinctCrop = await api.post("/api/crops", {
    crop_name: "maize",
    location: "S".repeat(100),
    target_min: 0,
    target_max: 100,
    normal_water: 10000,
    notes: "n".repeat(500),
  });
  assert.equal(caseDistinctCrop.response.status, 201);
  assert.equal(caseDistinctCrop.body.crop_name, "maize");
  assert.equal(caseDistinctCrop.body.location.length, 100);
  assert.equal(caseDistinctCrop.body.notes.length, 500);
  assert.equal(caseDistinctCrop.body.normal_water, 10000);
  await api.request("/api/crops/maize", { method: "DELETE" });

  const duplicate = await api.post("/api/crops", {
    crop_name: "Maize",
    ...maizeProfile,
  });
  assert.equal(duplicate.response.status, 409);

  const readingsAtCreate = await api.request("/api/readings");
  assert.deepEqual(readingsAtCreate.body, feedSnapshot);
  let maize = (await api.request("/api/crops")).body.find(
    ({ crop_name }) => crop_name === "Maize",
  );
  let [combinedMaize] = analyzeCropCards(
    [
      {
        cropName: maize.crop_name,
        location: maize.location,
        targetMoistureMin: maize.target_min,
        targetMoistureMax: maize.target_max,
        normalWater: maize.normal_water,
        notes: maize.notes,
      },
    ],
    readingsAtCreate.body,
    Date.parse("2026-10-26T10:00:00.000Z"),
  );
  assert.equal(combinedMaize.moisture, 55);
  assert.equal(combinedMaize.timestamp, Date.parse("2026-10-26T09:30:00.000Z"));
  assert.equal(combinedMaize.status, "Healthy");

  const updated = await api.put("/api/crops/Maize", {
    ...maizeProfile,
    location: "West Field",
    target_min: 60,
  });
  assert.equal(updated.response.status, 200);
  assert.equal(updated.body.crop_name, "Maize");
  assert.equal(updated.body.location, "West Field");
  assert.equal(updated.body.target_min, 60);
  const unchangedNameUpdate = await api.put("/api/crops/Maize", {
    crop_name: "Maize",
    ...maizeProfile,
    location: "West Field",
    target_min: 60,
  });
  assert.equal(unchangedNameUpdate.response.status, 200);
  maize = (await api.request("/api/crops")).body.find(
    ({ crop_name }) => crop_name === "Maize",
  );
  [combinedMaize] = analyzeCropCards(
    [
      {
        cropName: maize.crop_name,
        location: maize.location,
        targetMoistureMin: maize.target_min,
        targetMoistureMax: maize.target_max,
        normalWater: maize.normal_water,
        notes: maize.notes,
      },
    ],
    readingsAtCreate.body,
    Date.parse("2026-10-26T10:00:00.000Z"),
  );
  assert.equal(combinedMaize.status, "Dry");

  const changedName = await api.put("/api/crops/Maize", {
    crop_name: "maize",
    ...maizeProfile,
  });
  assert.equal(changedName.response.status, 400);

  const deleted = await api.request("/api/crops/Maize", { method: "DELETE" });
  assert.equal(deleted.response.status, 204);
  assert.equal(
    (await api.request("/api/crops")).body.some(
      (crop) => crop.crop_name === "Maize",
    ),
    false,
  );
  assert.deepEqual((await api.request("/api/readings")).body, feedSnapshot);
  assert.deepEqual((await api.request("/api/crop-options")).body, [
    "Maize",
    "maize",
  ]);

  const reCreated = await api.post("/api/crops", {
    crop_name: "Maize",
    ...maizeProfile,
  });
  assert.equal(reCreated.response.status, 201);
  assert.deepEqual((await api.request("/api/readings")).body, feedSnapshot);
  assert.equal(
    (await api.request("/api/crop-options")).body.includes("Maize"),
    false,
  );
});

test("crop API rejects invalid types, ranges, lengths, and user-supplied automatic fields", async (t) => {
  const database = new DatabaseSync(":memory:");
  initializeDatabase(database);
  const api = await createTestApi(t, database);

  const invalidProfiles = [
    { ...maizeProfile, target_min: "50" },
    { ...maizeProfile, target_min: 101 },
    { ...maizeProfile, target_max: 50 },
    { ...maizeProfile, target_min: 70, target_max: 70 },
    { ...maizeProfile, normal_water: "600" },
    { ...maizeProfile, normal_water: 0 },
    { ...maizeProfile, normal_water: 10000.1 },
    { ...maizeProfile, location: "" },
    { ...maizeProfile, location: "x".repeat(101) },
    { ...maizeProfile, notes: "x".repeat(501) },
    { ...maizeProfile, notes: 42 },
    { ...maizeProfile, id: 1 },
    { ...maizeProfile, created_at: "2026-01-01" },
  ];

  for (const profile of invalidProfiles) {
    const result = await api.post("/api/crops", {
      crop_name: "Maize",
      ...profile,
    });
    assert.equal(result.response.status, 400, JSON.stringify(profile));
  }

  const malformedJson = await api.request("/api/crops", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{",
  });
  assert.equal(malformedJson.response.status, 400);

  const created = await api.post("/api/crops", {
    crop_name: "Maize",
    ...maizeProfile,
  });
  assert.equal(created.response.status, 201);
  const badUpdate = await api.put("/api/crops/Maize", {
    ...maizeProfile,
    normal_water: "600",
  });
  assert.equal(badUpdate.response.status, 400);
});

test("legacy crop cards migrate into the new schema without reseeding or data loss", () => {
  const database = new DatabaseSync(":memory:");
  database.exec(`
    CREATE TABLE crop_cards (
      crop_name TEXT PRIMARY KEY COLLATE BINARY,
      location TEXT NOT NULL,
      target_moisture_min REAL NOT NULL,
      target_moisture_max REAL NOT NULL,
      normal_water_amount REAL NOT NULL,
      normal_water_unit TEXT NOT NULL,
      notes TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    INSERT INTO crop_cards VALUES (
      'Maize', 'South Field', 50, 70, 600, 'L', 'Keep profile',
      '2026-08-05 10:30:00', '2026-08-05 10:30:00'
    );
  `);

  initializeDatabase(database);

  const migrated = database
    .prepare("SELECT * FROM crops WHERE crop_name = 'Maize'")
    .get();
  assert.equal(migrated.location, "South Field");
  assert.equal(migrated.target_min, 50);
  assert.equal(migrated.target_max, 70);
  assert.equal(migrated.normal_water, 600);
  assert.equal(migrated.notes, "Keep profile");
  assert.equal(migrated.created_at, "2026-08-05 10:30:00");
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM crops").get().count, 1);
  assert.equal(
    database
      .prepare("SELECT name FROM sqlite_master WHERE name = 'crop_cards'")
      .get(),
    undefined,
  );
  database.close();
});
