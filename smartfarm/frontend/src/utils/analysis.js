const VALID_CROP_NAMES = new Set(["Tomato", "Lettuce", "Wheat", "Maize"]);
const VALID_SENSOR_STATUSES = new Set(["Online", "Offline", "Faulty"]);
const BUSINESS_RANGES = {
  soil_moisture: { label: "Soil moisture", minimum: 0, maximum: 100 },
  temperature: { label: "Temperature", minimum: 0, maximum: 50 },
  rainfall: { label: "Rainfall", minimum: 0, maximum: 50 },
};

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function parseTimestamp(value) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(value)
  ) {
    return null;
  }

  const timestamp = Date.parse(`${value}Z`);
  return Number.isFinite(timestamp) &&
    new Date(timestamp).toISOString().slice(0, 19) === value
    ? timestamp
    : null;
}

function getInvalidFields(reading) {
  const invalidFields = [];
  if (!VALID_CROP_NAMES.has(reading.crop_name)) invalidFields.push("Crop name");
  if (parseTimestamp(reading.timestamp) === null) invalidFields.push("Timestamp");
  if (!VALID_SENSOR_STATUSES.has(reading.sensor_status)) {
    invalidFields.push("Sensor status");
  }
  if (typeof reading.notes !== "string") invalidFields.push("Notes");

  for (const [field, range] of Object.entries(BUSINESS_RANGES)) {
    const value = reading[field];
    if (
      !isFiniteNumber(value) ||
      value < range.minimum ||
      value > range.maximum
    ) {
      invalidFields.push(
        `${range.label} (${Number.isFinite(value) ? value : "not a number"}; allowed ${range.minimum}-${range.maximum})`,
      );
    }
  }
  return invalidFields;
}

function getLatestReading(readings) {
  return (
    [...readings].sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0] ??
    null
  );
}

function withDecision(crop, reading, overrides) {
  return {
    ...crop,
    status: overrides.status,
    sensorHealth: overrides.sensorHealth ?? overrides.status,
    moisture: reading?.soil_moisture ?? null,
    temperature: reading?.temperature ?? null,
    rainfall: reading?.rainfall ?? null,
    timestamp: reading ? parseTimestamp(reading.timestamp) : null,
    recommendedWater: overrides.recommendedWater,
    action: overrides.action,
    alerts: overrides.alerts ?? [],
    invalidFields: overrides.invalidFields ?? [],
  };
}

function analyzeReading(crop, reading) {
  if (!reading) {
    return withDecision(crop, null, {
      status: "Sensor Problem",
      recommendedWater: "N/A",
      action: "Check sensor",
    });
  }

  if (reading.sensor_status === "Offline" || reading.sensor_status === "Faulty") {
    return withDecision(crop, reading, {
      status: "Sensor Problem",
      recommendedWater: "N/A",
      action: "Check sensor",
    });
  }

  const invalidFields = getInvalidFields(reading);
  if (invalidFields.length > 0) {
    return withDecision(crop, reading, {
      status: "Invalid Data",
      recommendedWater: "N/A",
      action: "Check reading",
      invalidFields,
    });
  }

  const alerts = [];
  if (reading.temperature > 35) alerts.push("High temperature");
  if (reading.rainfall >= 5) alerts.push("Rain detected");

  if (reading.soil_moisture < crop.targetMoistureMin) {
    return withDecision(crop, reading, {
      status: "Dry",
      sensorHealth: "Sensor OK",
      recommendedWater: `${crop.normalWater} L`,
      action: "Water crop",
      alerts,
    });
  }
  if (reading.soil_moisture <= crop.targetMoistureMax) {
    return withDecision(crop, reading, {
      status: "Healthy",
      sensorHealth: "Sensor OK",
      recommendedWater: "0 L",
      action: "Monitor",
      alerts,
    });
  }
  return withDecision(crop, reading, {
    status: "Too Wet",
    sensorHealth: "Sensor OK",
    recommendedWater: "0 L",
    action: "Stop watering",
    alerts,
  });
}

export function analyzeCropCards(cropCards, readings) {
  if (!Array.isArray(cropCards)) {
    throw new Error("Crop cards must be an array");
  }
  if (!Array.isArray(readings)) {
    throw new Error("The sensor feed must be a JSON array");
  }

  const readingsByCrop = new Map();
  for (const reading of readings) {
    if (
      reading === null ||
      typeof reading !== "object" ||
      typeof reading.crop_name !== "string" ||
      reading.crop_name.trim().length === 0
    ) {
      continue;
    }

    const cropReadings = readingsByCrop.get(reading.crop_name) ?? [];
    cropReadings.push(reading);
    readingsByCrop.set(reading.crop_name, cropReadings);
  }

  return cropCards.map((crop) => {
    const latest = getLatestReading(readingsByCrop.get(crop.cropName) ?? []);
    return analyzeReading(crop, latest);
  });
}

export function createUnavailableCropCards(cropCards) {
  return cropCards.map((crop) =>
    withDecision(crop, null, {
      status: "Sensor Feed Unavailable",
      recommendedWater: "N/A",
      action: "Refresh sensor data",
    }),
  );
}

export function getOverallFarmStatus(crops, hasSuccessfulSensorData) {
  if (!Array.isArray(crops)) {
    throw new Error("Crop cards must be an array");
  }
  if (crops.length === 0) return "No Crops";
  if (!hasSuccessfulSensorData) return "Sensor Feed Unavailable";
  if (
    crops.some(
      ({ status }) => status === "Sensor Problem" || status === "Invalid Data",
    )
  ) {
    return "Critical";
  }
  if (
    crops.some(
      ({ status, alerts }) =>
        status === "Dry" ||
        status === "Too Wet" ||
        alerts?.includes("High temperature"),
    )
  ) {
    return "Watch";
  }
  return "Normal";
}
