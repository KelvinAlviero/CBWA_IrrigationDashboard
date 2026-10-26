import assert from "node:assert/strict";
import test from "node:test";
import { analyzeCropCards } from "./analysis.js";

const now = Date.parse("2026-10-26T10:00:00.000Z");
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
    now,
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
    now,
  );

  assert.deepEqual(
    crops.map(({ status }) => status),
    ["Dry", "Healthy", "Healthy", "Too Wet"],
  );
});

test("distinguishes sensor problems from invalid readings", () => {
  const crops = analyzeCropCards(
    [card("Tomato"), card("Lettuce"), card("Wheat")],
    [
      reading("Tomato", recentTimestamp, 50, { sensor_status: "Offline" }),
      reading("Lettuce", recentTimestamp, 101),
      reading("Wheat", "2026-10-24T09:00:00", 50),
    ],
    now,
  );

  assert.deepEqual(
    crops.map(({ status, sensorHealth }) => [status, sensorHealth]),
    [
      ["Sensor Problem", "Sensor Problem"],
      ["Invalid Data", "Invalid Data"],
      ["Sensor Problem", "Sensor Problem"],
    ],
  );
});

test("reports invalid timestamps and missing readings explicitly", () => {
  const crops = analyzeCropCards(
    [card("Tomato"), card("Maize")],
    [reading("Tomato", "not-a-date", 50)],
    now,
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
    now,
  );

  assert.deepEqual(
    crops.map(({ status, sensorHealth }) => [status, sensorHealth]),
    Array.from({ length: 4 }, () => ["Invalid Data", "Invalid Data"]),
  );
});

test("ignores malformed feed rows and rejects invalid input collections", () => {
  assert.deepEqual(
    analyzeCropCards([card("Tomato")], [{ timestamp: recentTimestamp }], now)[0]
      .status,
    "Sensor Problem",
  );
  assert.throws(() => analyzeCropCards(null, [], now), /Crop cards must be an array/);
  assert.throws(() => analyzeCropCards([], null, now), /JSON array/);
});
