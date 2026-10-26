import assert from "node:assert/strict";
import test from "node:test";
import { analyzeCropCards } from "./analysis.js";

const now = Date.parse("2026-10-26T10:00:00.000Z");
const recentTimestamp = "2026-10-26T09:30:00.000Z";

function card(cropName, targetMoistureMin = 30, targetMoistureMax = 70) {
  return { cropName, targetMoistureMin, targetMoistureMax };
}

test("matches exact case-sensitive crop names and uses the greatest timestamp", () => {
  const crops = analyzeCropCards(
    [card("Tomatoes"), card("tomatoes")],
    [
      { crop_name: "Tomatoes", timestamp: recentTimestamp, soilMoisture: 22 },
      {
        crop_name: "tomatoes",
        timestamp: recentTimestamp,
        soilMoisture: 55,
      },
      {
        crop_name: "Tomatoes",
        timestamp: "2026-10-26T08:00:00.000Z",
        soilMoisture: 55,
      },
    ],
    now,
  );

  assert.equal(crops[0].moisture, 22);
  assert.equal(crops[0].status, "Dry");
  assert.equal(crops[1].status, "Healthy");
});

test("uses each saved crop target range and accepts both range boundaries", () => {
  const crops = analyzeCropCards(
    [card("Low", 30, 70), card("Min", 30, 70), card("Max", 30, 70), card("High", 30, 70)],
    [0, 30, 70, 100].map((soilMoisture, index) => ({
      crop_name: ["Low", "Min", "Max", "High"][index],
      timestamp: recentTimestamp,
      soilMoisture,
    })),
    now,
  );

  assert.deepEqual(
    crops.map(({ status }) => status),
    ["Dry", "Healthy", "Healthy", "Too Wet"],
  );
});

test("distinguishes sensor problems from invalid readings", () => {
  const crops = analyzeCropCards(
    [card("Disconnected"), card("Out of range"), card("Stale")],
    [
      {
        crop_name: "Disconnected",
        timestamp: recentTimestamp,
        soilMoisture: 50,
        sensor_status: "problem",
      },
      {
        crop_name: "Out of range",
        timestamp: recentTimestamp,
        soilMoisture: 101,
      },
      {
        crop_name: "Stale",
        timestamp: "2026-10-24T09:00:00.000Z",
        soilMoisture: 50,
      },
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
    [card("Untimed"), card("Missing")],
    [{ crop_name: "Untimed", timestamp: "not-a-date", soilMoisture: 50 }],
    now,
  );

  assert.equal(crops[0].status, "Invalid Data");
  assert.equal(crops[1].status, "Sensor Problem");
  assert.equal(crops[1].moisture, null);
});

test("ignores malformed feed rows and rejects invalid input collections", () => {
  assert.deepEqual(
    analyzeCropCards([card("Tomatoes")], [{ timestamp: recentTimestamp }], now)[0]
      .status,
    "Sensor Problem",
  );
  assert.throws(() => analyzeCropCards(null, [], now), /Crop cards must be an array/);
  assert.throws(() => analyzeCropCards([], null, now), /JSON array/);
});
