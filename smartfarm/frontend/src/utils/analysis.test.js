import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzeCropCards,
  createUnavailableCropCards,
  getOverallFarmStatus,
} from "./analysis.js";

const recentTimestamp = "2026-10-26T09:30:00";

function reading(crop_name, timestamp, soil_moisture, overrides = {}) {
  return {
    crop_name,
    timestamp,
    soil_moisture,
    temperature: 25,
    rainfall: 0,
    sensor_status: "Online",
    notes: "",
    ...overrides,
  };
}

function card(cropName, targetMoistureMin = 30, targetMoistureMax = 70) {
  return { cropName, targetMoistureMin, targetMoistureMax };
}

test("matches exact case-sensitive crop names and uses the greatest timestamp", () => {
  const crops = analyzeCropCards(
    [card("Tomato"), card("tomato")],
    [
      reading("Tomato", recentTimestamp, 22),
      reading("Tomato", "2026-10-26T08:00:00", 55),
    ],
  );

  assert.equal(crops[0].moisture, 22);
  assert.equal(crops[0].status, "Dry");
  assert.equal(crops[1].status, "Sensor Problem");
});

test("uses each saved crop target range and accepts both range boundaries", () => {
  const crops = analyzeCropCards(
    [
      card("Tomato", 30, 70),
      card("Lettuce", 30, 70),
      card("Wheat", 30, 70),
      card("Maize", 30, 70),
    ],
    [0, 30, 70, 100].map((soil_moisture, index) =>
      reading(
        ["Tomato", "Lettuce", "Wheat", "Maize"][index],
        recentTimestamp,
        soil_moisture,
      ),
    ),
  );

  assert.deepEqual(
    crops.map(({ status }) => status),
    ["Dry", "Healthy", "Healthy", "Too Wet"],
  );
});

test("sensor problems take priority and reading age alone does not change condition", () => {
  const crops = analyzeCropCards(
    [card("Tomato"), card("Lettuce"), card("Wheat")],
    [
      reading("Tomato", recentTimestamp, 50, { sensor_status: "Offline" }),
      reading("Lettuce", recentTimestamp, 101),
      reading("Wheat", "2026-10-24T09:00:00", 50),
    ],
  );

  assert.deepEqual(
    crops.map(({ status, sensorHealth }) => [status, sensorHealth]),
    [
      ["Sensor Problem", "Sensor Problem"],
      ["Invalid Data", "Invalid Data"],
      ["Healthy", "Sensor OK"],
    ],
  );
});

test("reports invalid timestamps and missing readings explicitly", () => {
  const crops = analyzeCropCards(
    [card("Tomato"), card("Maize")],
    [reading("Tomato", "not-a-date", 50)],
  );

  assert.equal(crops[0].status, "Invalid Data");
  assert.equal(crops[1].status, "Sensor Problem");
  assert.equal(crops[1].moisture, null);
});

test("marks readings with invalid sensor fields as invalid data", () => {
  const crops = analyzeCropCards(
    [card("Tomato"), card("Lettuce"), card("Wheat"), card("Maize")],
    [
      reading("Tomato", recentTimestamp, 50, { temperature: 51 }),
      reading("Lettuce", recentTimestamp, 50, { rainfall: -1 }),
      reading("Wheat", recentTimestamp, 50, { sensor_status: "ok" }),
      reading("Maize", recentTimestamp, 50, { notes: 1 }),
    ],
  );

  assert.deepEqual(
    crops.map(({ status, sensorHealth }) => [status, sensorHealth]),
    Array.from({ length: 4 }, () => ["Invalid Data", "Invalid Data"]),
  );
});

test("only Online readings with out-of-range values are invalid data", () => {
  const crops = analyzeCropCards(
    [card("Tomato"), card("Lettuce"), card("Wheat")],
    [
      reading("Tomato", recentTimestamp, 101),
      reading("Lettuce", recentTimestamp, 50, {
        temperature: 51,
      }),
      reading("Wheat", recentTimestamp, 50, {
        rainfall: -1,
        sensor_status: "Offline",
      }),
    ],
  );

  assert.deepEqual(
    crops.map(({ status, sensorHealth }) => [status, sensorHealth]),
    [
      ["Invalid Data", "Invalid Data"],
      ["Invalid Data", "Invalid Data"],
      ["Sensor Problem", "Sensor Problem"],
    ],
  );
});

test("applies water recommendations, actions, and additional alert boundaries", () => {
  const crops = analyzeCropCards(
    [
      { ...card("Tomato", 50, 70), normalWater: 500 },
      { ...card("Lettuce", 50, 70), normalWater: 400 },
      { ...card("Wheat", 50, 70), normalWater: 300 },
      { ...card("Maize", 50, 70), normalWater: 600 },
    ],
    [
      reading("Tomato", recentTimestamp, 49, {
        temperature: 36,
        rainfall: 5,
      }),
      reading("Lettuce", recentTimestamp, 50, {
        temperature: 35,
        rainfall: 5,
      }),
      reading("Wheat", recentTimestamp, 70),
      reading("Maize", recentTimestamp, 71),
    ],
  );

  assert.deepEqual(
    crops.map(({ status, recommendedWater, action, alerts }) => ({
      status,
      recommendedWater,
      action,
      alerts,
    })),
    [
      {
        status: "Dry",
        recommendedWater: "500 L",
        action: "Water crop",
        alerts: ["High temperature", "Rain detected"],
      },
      {
        status: "Healthy",
        recommendedWater: "0 L",
        action: "Monitor",
        alerts: ["Rain detected"],
      },
      {
        status: "Healthy",
        recommendedWater: "0 L",
        action: "Monitor",
        alerts: [],
      },
      {
        status: "Too Wet",
        recommendedWater: "0 L",
        action: "Stop watering",
        alerts: [],
      },
    ],
  );
});

test("sensor and invalid conditions stop later checks and show required guidance", () => {
  const crops = analyzeCropCards(
    [
      { ...card("Tomato"), normalWater: 500 },
      { ...card("Lettuce"), normalWater: 400 },
    ],
    [
      reading("Tomato", recentTimestamp, 120, {
        sensor_status: "Faulty",
      }),
      reading("Lettuce", recentTimestamp, 120),
    ],
  );

  assert.deepEqual(
    crops.map(
      ({ status, recommendedWater, action, invalidFields, alerts }) => ({
        status,
        recommendedWater,
        action,
        invalidFields,
        alerts,
      }),
    ),
    [
      {
        status: "Sensor Problem",
        recommendedWater: "N/A",
        action: "Check sensor",
        invalidFields: [],
        alerts: [],
      },
      {
        status: "Invalid Data",
        recommendedWater: "N/A",
        action: "Check reading",
        invalidFields: ["Soil moisture (120; allowed 0-100)"],
        alerts: [],
      },
    ],
  );
});

test("calculates overall farm status with critical and no-crop priorities", () => {
  const healthy = [{ status: "Healthy", alerts: [] }];
  assert.equal(getOverallFarmStatus([], false), "No Crops");
  assert.equal(getOverallFarmStatus(healthy, false), "Sensor Feed Unavailable");
  assert.equal(
    getOverallFarmStatus([{ status: "Invalid Data" }, ...healthy], true),
    "Critical",
  );
  assert.equal(
    getOverallFarmStatus([{ status: "Dry" }, ...healthy], true),
    "Watch",
  );
  assert.equal(
    getOverallFarmStatus(
      [{ status: "Healthy", alerts: ["High temperature"] }],
      true,
    ),
    "Watch",
  );
  assert.equal(
    getOverallFarmStatus(
      [{ status: "Healthy", alerts: ["Rain detected"] }],
      true,
    ),
    "Normal",
  );
  assert.equal(getOverallFarmStatus(healthy, true), "Normal");
});

test("marks existing cards unavailable before the first successful sensor response", () => {
  const [crop] = createUnavailableCropCards([
    { ...card("Tomato"), normalWater: 500 },
  ]);

  assert.equal(crop.status, "Sensor Feed Unavailable");
  assert.equal(crop.recommendedWater, "N/A");
  assert.equal(crop.action, "Refresh sensor data");
  assert.equal(
    getOverallFarmStatus([crop], false),
    "Sensor Feed Unavailable",
  );
});

test("ignores malformed feed rows and rejects invalid input collections", () => {
  assert.deepEqual(
    analyzeCropCards([card("Tomato")], [{ timestamp: recentTimestamp }])[0]
      .status,
    "Sensor Problem",
  );
  assert.throws(() => analyzeCropCards(null, []), /Crop cards must be an array/);
  assert.throws(() => analyzeCropCards([], null), /JSON array/);
});
