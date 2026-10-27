import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  analyseCrop,
  getLatestReading,
} from "../frontend/src/utils/analysis.js";
import { getSensorReadings, initializeDatabase } from "./db.js";
import { createApiServer } from "./server.js";

const sensorFeed = ["Tomato", "Lettuce", "Wheat", "Maize"].flatMap(
  (crop_name) =>
    Array.from({ length: 5 }, (_, index) => ({
      crop_name,
      timestamp: `2026-10-26T${String(8 + Math.floor(index / 2)).padStart(2, "0")}:${index % 2 === 1 ? "30" : "00"}:00`,
      soil_moisture:
        crop_name === "Maize" ? [25, 30, 40, 48, 55][index] : 60,
      temperature: 25,
      rainfall: 0,
      sensor_status: "Online",
      notes: "",
    })),
);

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
    readReadings: async () =>
      structuredClone(
        typeof readings === "function" ? await readings() : readings,
      ),
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

test("static sensor file contains exactly five valid readings for each supported crop", async () => {
  const readings = await getSensorReadings();
  const expectedCrops = ["Tomato", "Lettuce", "Wheat", "Maize"];
  const readingsByCrop = new Map(expectedCrops.map((cropName) => [cropName, []]));
  const timestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;

  assert.equal(readings.length, 20);
  const allowedFields = [
    "crop_name",
    "timestamp",
    "soil_moisture",
    "temperature",
    "rainfall",
    "sensor_status",
    "notes",
  ].sort();
  const outOfRangeReadings = [];
  for (const reading of readings) {
    assert.ok(readingsByCrop.has(reading.crop_name));
    assert.deepEqual(Object.keys(reading).sort(), allowedFields);
    assert.match(reading.timestamp, timestampPattern);
    assert.ok(Number.isFinite(Date.parse(`${reading.timestamp}Z`)));
    assert.equal(typeof reading.soil_moisture, "number");
    assert.equal(typeof reading.temperature, "number");
    assert.equal(typeof reading.rainfall, "number");
    assert.ok(["Online", "Offline", "Faulty"].includes(reading.sensor_status));
    assert.equal(typeof reading.notes, "string");
    const numericOutOfRangeFields = [
      ["soil_moisture", 0, 100],
      ["temperature", 0, 50],
      ["rainfall", 0, 50],
    ].filter(
      ([field, minimum, maximum]) =>
        reading[field] < minimum || reading[field] > maximum,
    );
    if (numericOutOfRangeFields.length > 0) {
      outOfRangeReadings.push({ reading, numericOutOfRangeFields });
    }
    readingsByCrop.get(reading.crop_name).push(reading.timestamp);
  }

  for (const timestamps of readingsByCrop.values()) {
    assert.equal(timestamps.length, 5);
    assert.equal(new Set(timestamps).size, 5);
  }

  assert.equal(outOfRangeReadings.length, 1);
  assert.deepEqual(
    outOfRangeReadings[0].numericOutOfRangeFields.map(([field]) => field),
    ["soil_moisture"],
  );
  const invalidReading = outOfRangeReadings[0].reading;
  const latestInvalidCropReading = readings
    .filter(({ crop_name }) => crop_name === invalidReading.crop_name)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0];
  assert.notEqual(latestInvalidCropReading, invalidReading);

  const defaultCards = [
    {
      crop_name: "Tomato",
      location: "Greenhouse A",
      target_min: 55,
      target_max: 75,
      normal_water: 500,
    },
    {
      crop_name: "Lettuce",
      location: "Greenhouse B",
      target_min: 60,
      target_max: 80,
      normal_water: 400,
    },
    {
      crop_name: "Wheat",
      location: "North Field",
      target_min: 35,
      target_max: 55,
      normal_water: 300,
    },
    {
      crop_name: "Maize",
      location: "South Field",
      target_min: 50,
      target_max: 70,
      normal_water: 600,
    },
  ];
  const results = defaultCards.map((crop) =>
    analyseCrop(crop, getLatestReading(crop.crop_name, readings)),
  );
  assert.deepEqual(
    results.map(({ crop, latest_reading, condition, recommended_water, alerts, action }) => ({
      crop_name: crop.crop_name,
      timestamp: latest_reading.timestamp,
      condition,
      recommended_water,
      alerts,
      action,
    })),
    [
      {
        crop_name: "Tomato",
        timestamp: "2026-10-26T10:00:00",
        condition: "Dry",
        recommended_water: "500 L",
        alerts: ["High temperature"],
        action: "Water crop",
      },
      {
        crop_name: "Lettuce",
        timestamp: "2026-10-26T10:05:00",
        condition: "Healthy",
        recommended_water: "0 L",
        alerts: [],
        action: "Monitor",
      },
      {
        crop_name: "Wheat",
        timestamp: "2026-10-26T10:10:00",
        condition: "Too Wet",
        recommended_water: "0 L",
        alerts: ["Rain detected"],
        action: "Stop watering",
      },
      {
        crop_name: "Maize",
        timestamp: "2026-10-26T10:15:00",
        condition: "Sensor Problem",
        recommended_water: "N/A",
        alerts: [],
        action: "Check sensor",
      },
    ],
  );
  const latestReadingIndexes = defaultCards.map((crop) =>
    readings.indexOf(getLatestReading(crop.crop_name, readings)),
  );
  assert.ok(latestReadingIndexes.some((index) => index < readings.length - 1));
});

test("structurally valid out-of-range readings are returned by the API", async (t) => {
  const database = new DatabaseSync(":memory:");
  initializeDatabase(database);
  const outOfRangeFeed = structuredClone(sensorFeed);
  outOfRangeFeed[0] = {
    ...outOfRangeFeed[0],
    soil_moisture: 101,
    temperature: 51,
    rainfall: 51,
  };
  const api = await createTestApi(t, database, outOfRangeFeed);

  const response = await api.request("/api/readings");
  assert.equal(response.response.status, 200);
  assert.deepEqual(response.body[0], outOfRangeFeed[0]);
});

test("structurally invalid sensor files return the exact 500 response", async (t) => {
  const database = new DatabaseSync(":memory:");
  initializeDatabase(database);
  let feed = sensorFeed;
  let shouldThrow = false;
  const api = await createTestApi(t, database, () => {
    if (shouldThrow) throw new SyntaxError("Invalid JSON");
    return feed;
  });
  const invalidFeeds = [
    null,
    sensorFeed.slice(1),
    sensorFeed.map((reading, index) =>
      index === 0
        ? {
            ...reading,
            crop_name: "Lettuce",
            timestamp: "2026-10-26T10:30:00",
          }
        : reading,
    ),
    sensorFeed.map((reading, index) =>
      index === 0 ? { ...reading, crop_name: "Lettuce" } : reading,
    ),
    sensorFeed.map((reading, index) =>
      index === 0 ? { ...reading, crop_name: "Corn" } : reading,
    ),
    sensorFeed.map((reading, index) =>
      index === 0 ? { ...reading, timestamp: "2026-02-30T10:00:00" } : reading,
    ),
    sensorFeed.map((reading, index) =>
      index === 0
        ? { ...reading, timestamp: sensorFeed[1].timestamp }
        : reading,
    ),
    sensorFeed.map((reading, index) =>
      index === 0 ? { ...reading, soil_moisture: "40" } : reading,
    ),
    sensorFeed.map((reading, index) => {
      if (index !== 0) return reading;
      const { soil_moisture, ...missingField } = reading;
      return missingField;
    }),
    sensorFeed.map((reading, index) =>
      index === 0 ? { ...reading, temperature: null } : reading,
    ),
    sensorFeed.map((reading, index) =>
      index === 0 ? { ...reading, rainfall: false } : reading,
    ),
    sensorFeed.map((reading, index) =>
      index === 0 ? { ...reading, sensor_status: "ok" } : reading,
    ),
    sensorFeed.map((reading, index) =>
      index === 0 ? { ...reading, notes: null } : reading,
    ),
  ];

  for (const invalidFeed of invalidFeeds) {
    feed = invalidFeed;
    const response = await api.request("/api/readings");
    assert.equal(response.response.status, 500);
    assert.deepEqual(response.body, { error: "Sensor data file is invalid" });
  }

  shouldThrow = true;
  const parseErrorResponse = await api.request("/api/readings");
  assert.equal(parseErrorResponse.response.status, 500);
  assert.deepEqual(parseErrorResponse.body, {
    error: "Sensor data file is invalid",
  });
});

test("readings endpoint invokes the sensor-file reader for every request", async (t) => {
  const database = new DatabaseSync(":memory:");
  initializeDatabase(database);
  let readCount = 0;
  let feed = structuredClone(sensorFeed);
  const api = await createTestApi(t, database, () => {
    readCount += 1;
    return feed;
  });

  const firstResponse = await api.request("/api/readings");
  assert.equal(firstResponse.body[0].soil_moisture, 60);

  feed = feed.map((reading, index) =>
    index === 0 ? { ...reading, soil_moisture: 42 } : reading,
  );
  const refreshedResponse = await api.request("/api/readings");
  assert.equal(refreshedResponse.body[0].soil_moisture, 42);
  assert.equal(readCount, 2);
});

test("unexpected database failures use the JSON internal-server-error contract", async (t) => {
  const database = {
    prepare() {
      throw new Error("database unavailable");
    },
    close() {},
  };
  const api = await createTestApi(t, database);
  const response = await api.request("/api/crops");

  assert.equal(response.response.status, 500);
  assert.deepEqual(response.body, { error: "Internal server error" });
});

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
  assert.deepEqual(options.body, ["Maize"]);

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
  const readById = await api.request(`/api/crops/${created.body.id}`);
  assert.equal(readById.response.status, 200);
  assert.equal(readById.body.crop_name, "Maize");
  const missingId = await api.request("/api/crops/99999");
  assert.equal(missingId.response.status, 404);
  assert.deepEqual(missingId.body, { error: "Crop card not found" });

  const invalidCase = await api.post("/api/crops", {
    crop_name: "maize",
    ...maizeProfile,
  });
  assert.equal(invalidCase.response.status, 400);
  assert.deepEqual(invalidCase.body, {
    error: "crop_name does not exist in sensor data",
  });

  const duplicate = await api.post("/api/crops", {
    crop_name: "Maize",
    ...maizeProfile,
  });
  assert.equal(duplicate.response.status, 409);
  assert.deepEqual(duplicate.body, { error: "crop_name already exists" });

  const readingsAtCreate = await api.request("/api/readings");
  assert.deepEqual(readingsAtCreate.body, feedSnapshot);
  let maize = (await api.request("/api/crops")).body.find(
    ({ crop_name }) => crop_name === "Maize",
  );
  let combinedMaize = analyseCrop(
    maize,
    getLatestReading("Maize", readingsAtCreate.body),
  );
  assert.equal(combinedMaize.latest_reading.soil_moisture, 55);
  assert.equal(combinedMaize.latest_reading.timestamp, "2026-10-26T10:00:00");
  assert.equal(combinedMaize.condition, "Healthy");

  const updated = await api.put(`/api/crops/${maize.id}`, {
    ...maizeProfile,
    location: "West Field",
    target_min: 60,
  });
  assert.equal(updated.response.status, 200);
  assert.equal(updated.body.crop_name, "Maize");
  assert.equal(updated.body.location, "West Field");
  assert.equal(updated.body.target_min, 60);
  const unchangedNameUpdate = await api.put(`/api/crops/${maize.id}`, {
    crop_name: "Maize",
    ...maizeProfile,
    location: "West Field",
    target_min: 60,
  });
  assert.equal(unchangedNameUpdate.response.status, 200);
  maize = (await api.request("/api/crops")).body.find(
    ({ crop_name }) => crop_name === "Maize",
  );
  combinedMaize = analyseCrop(
    maize,
    getLatestReading("Maize", readingsAtCreate.body),
  );
  assert.equal(combinedMaize.condition, "Dry");

  const changedName = await api.put(`/api/crops/${maize.id}`, {
    crop_name: "maize",
    ...maizeProfile,
  });
  assert.equal(changedName.response.status, 400);
  assert.deepEqual(changedName.body, {
    error: "crop_name cannot be changed",
  });

  const deleted = await api.request(`/api/crops/${maize.id}`, {
    method: "DELETE",
  });
  assert.equal(deleted.response.status, 200);
  assert.deepEqual(deleted.body, { deleted: true, id: maize.id });
  assert.equal(
    (await api.request("/api/crops")).body.some(
      (crop) => crop.crop_name === "Maize",
    ),
    false,
  );
  assert.deepEqual((await api.request("/api/readings")).body, feedSnapshot);
  assert.deepEqual((await api.request("/api/crop-options")).body, ["Maize"]);

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
  const missingLocation = await api.post("/api/crops", {
    crop_name: "Maize",
    ...maizeProfile,
    location: undefined,
  });
  assert.equal(missingLocation.response.status, 400);
  assert.deepEqual(missingLocation.body, { error: "location is required" });
  const missingCropName = await api.post("/api/crops", {
    ...maizeProfile,
    location: "South Field",
  });
  assert.equal(missingCropName.response.status, 400);
  assert.deepEqual(missingCropName.body, { error: "crop_name is required" });

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
  const badUpdate = await api.put(`/api/crops/${created.body.id}`, {
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
