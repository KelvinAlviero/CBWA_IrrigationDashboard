import assert from "node:assert/strict";
import test from "node:test";
import { analyzeReadings } from "./analysis.js";

const now = Date.parse("2026-10-26T10:00:00.000Z");
const recentTimestamp = "2026-10-26T09:30:00.000Z";

test("groups by exact crop_name and uses the latest timestamp per crop", () => {
  const crops = analyzeReadings(
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

  assert.equal(crops.length, 2);
  assert.equal(crops[0].cropName, "Tomatoes");
  assert.equal(crops[0].moisture, 22);
  assert.equal(crops[0].status, "Dry");
  assert.equal(crops[1].cropName, "tomatoes");
  assert.equal(crops[1].status, "Healthy");
});

test("classifies moisture range boundaries and wet readings", () => {
  const crops = analyzeReadings(
    [0, 30, 70, 100].map((soilMoisture, index) => ({
      crop_name: `Crop ${index}`,
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
  const crops = analyzeReadings(
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

test("marks a crop invalid when it has no parseable timestamp", () => {
  const [crop] = analyzeReadings(
    [{ crop_name: "Untimed", timestamp: "not-a-date", soilMoisture: 50 }],
    now,
  );

  assert.equal(crop.status, "Invalid Data");
});

test("ignores readings without a usable crop name and rejects non-array feeds", () => {
  assert.deepEqual(analyzeReadings([{ timestamp: recentTimestamp }], now), []);
  assert.throws(() => analyzeReadings(null, now), /JSON array/);
});
