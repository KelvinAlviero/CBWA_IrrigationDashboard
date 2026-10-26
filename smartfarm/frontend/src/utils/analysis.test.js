import assert from "node:assert/strict";
import test from "node:test";
import {
  analyseCrop,
  analyseCropCards,
  calculateFarmStatus,
  createUnavailableCropCards,
  getAvailableCropNames,
  getLatestReading,
} from "./analysis.js";

function card(cropName, target_min = 30, target_max = 70, normal_water = 500) {
  return {
    id: cropName,
    crop_name: cropName,
    location: "Field",
    target_min,
    target_max,
    normal_water,
    notes: "",
  };
}

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

test("available crop names are unique and exclude existing exact-name cards", () => {
  assert.deepEqual(
    getAvailableCropNames(
      [
        reading("Tomato", "2026-10-26T09:00:00", 40),
        reading("Tomato", "2026-10-26T09:30:00", 45),
        reading("Maize", "2026-10-26T09:15:00", 50),
        reading("tomato", "2026-10-26T09:20:00", 50),
      ],
      [{ cropName: "Tomato" }],
    ),
    ["Maize"],
  );
});

test("latest selection matches exact crop names and ignores array order", () => {
  const readings = [
    reading("Maize", "2026-10-26T08:00:00", 25),
    reading("Tomato", "2026-10-26T09:00:00", 40),
    reading("Maize", "2026-10-26T10:00:00", 55),
    reading("maize", "2026-10-26T11:00:00", 60),
    reading("Maize", "2026-10-26T09:00:00", 45),
  ];

  assert.equal(getLatestReading("Maize", readings).soil_moisture, 55);
  assert.equal(getLatestReading("maize", readings).soil_moisture, 60);
  assert.equal(getLatestReading("Wheat", readings), null);
});

test("analysis returns the required output shape and condition decisions", () => {
  const dry = analyseCrop(
    card("Tomato", 50, 70, 500),
    reading("Tomato", "2026-10-26T09:30:00", 49, {
      temperature: 36,
      rainfall: 5,
    }),
  );
  assert.deepEqual(
    {
      crop: dry.crop,
      latest_reading: dry.latest_reading,
      condition: dry.condition,
      recommended_water: dry.recommended_water,
      alerts: dry.alerts,
      action: dry.action,
    },
    {
      crop: card("Tomato", 50, 70, 500),
      latest_reading: {
        timestamp: "2026-10-26T09:30:00",
        soil_moisture: 49,
        temperature: 36,
        rainfall: 5,
        sensor_status: "Online",
        notes: "",
      },
      condition: "Dry",
      recommended_water: "500 L",
      alerts: ["High temperature", "Rain detected"],
      action: "Water crop",
    },
  );

  assert.equal(
    analyseCrop(
      card("Lettuce", 50, 70),
      reading("Lettuce", "2026-10-26T09:30:00", 50, {
        temperature: 35,
        rainfall: 5,
      }),
    ).condition,
    "Healthy",
  );
  assert.equal(
    analyseCrop(
      card("Wheat", 50, 70),
      reading("Wheat", "2026-10-26T09:30:00", 70),
    ).condition,
    "Healthy",
  );
  assert.equal(
    analyseCrop(
      card("Maize", 50, 70),
      reading("Maize", "2026-10-26T09:30:00", 71),
    ).condition,
    "Too Wet",
  );
});

test("sensor condition wins over invalid numeric fields; Online range violations identify fields", () => {
  const faulty = analyseCrop(
    card("Tomato"),
    reading("Tomato", "2026-10-26T09:30:00", 120, {
      sensor_status: "Faulty",
    }),
  );
  assert.equal(faulty.condition, "Sensor Problem");
  assert.equal(faulty.recommended_water, "N/A");
  assert.equal(faulty.action, "Check sensor");

  const invalid = analyseCrop(
    card("Lettuce"),
    reading("Lettuce", "2026-10-26T09:30:00", 120, {
      temperature: 51,
      rainfall: -1,
    }),
  );
  assert.equal(invalid.condition, "Invalid Data");
  assert.equal(invalid.recommended_water, "N/A");
  assert.equal(invalid.action, "Check reading");
  assert.equal(invalid.invalid_fields.length, 3);
  assert.deepEqual(invalid.alerts, []);
});

test("card analysis and history use the same reusable crop analyzer", () => {
  const crop = card("Maize", 50, 70, 600);
  const readings = [
    reading("Maize", "2026-10-26T08:00:00", 25),
    reading("Maize", "2026-10-26T10:00:00", 55),
    reading("Tomato", "2026-10-26T11:00:00", 20),
  ];
  const result = analyseCropCards([crop], readings)[0];

  assert.equal(result.condition, "Healthy");
  assert.equal(
    result.condition,
    analyseCrop(crop, getLatestReading("Maize", readings)).condition,
  );
});

test("farm status priority, high temperature, and rain-only behavior", () => {
  const healthy = { condition: "Healthy", alerts: [] };
  assert.equal(calculateFarmStatus([]), "No Crops");
  assert.equal(calculateFarmStatus([healthy], false), "Sensor Feed Unavailable");
  assert.equal(
    calculateFarmStatus(
      [healthy, { condition: "Invalid Data", alerts: [] }],
    ),
    "Critical",
  );
  assert.equal(
    calculateFarmStatus([{ condition: "Dry", alerts: [] }]),
    "Watch",
  );
  assert.equal(
    calculateFarmStatus([
      { condition: "Healthy", alerts: ["High temperature"] },
    ]),
    "Watch",
  );
  assert.equal(
    calculateFarmStatus([{ condition: "Healthy", alerts: ["Rain detected"] }]),
    "Normal",
  );
  assert.equal(calculateFarmStatus([healthy]), "Normal");
});

test("unavailable sensor state preserves profiles and recommended water is N/A", () => {
  const crops = createUnavailableCropCards([
    { cropName: "Tomato", location: "Field", normalWater: 500 },
  ]);

  assert.equal(crops[0].condition, "Sensor Feed Unavailable");
  assert.equal(crops[0].recommended_water, "N/A");
  assert.equal(calculateFarmStatus(crops, false), "Sensor Feed Unavailable");
});

test("rejects invalid collection arguments", () => {
  assert.throws(() => getAvailableCropNames(null, []), /must be arrays/);
  assert.throws(() => getLatestReading("Tomato", null), /JSON array/);
  assert.throws(() => analyseCropCards(null, []), /must be arrays/);
  assert.throws(() => calculateFarmStatus(null), /must be an array/);
});
