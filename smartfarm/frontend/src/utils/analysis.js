export const DEFAULT_MOISTURE_RANGE = { min: 30, max: 70 };
export const SENSOR_STALE_AFTER_MS = 24 * 60 * 60 * 1000;

function isValidMoisture(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
}

function getLatestReading(readings) {
  const timestamped = readings
    .map((reading, index) => ({
      reading,
      index,
      timestamp: Date.parse(reading.timestamp),
    }))
    .filter(({ timestamp }) => Number.isFinite(timestamp));

  if (timestamped.length === 0) {
    return { reading: readings.at(-1), timestamp: null };
  }

  const latest = timestamped.reduce((newest, candidate) =>
    candidate.timestamp >= newest.timestamp ? candidate : newest,
  );

  return { ...latest, timestamp: latest.timestamp };
}

function analyzeCropReadings(cropName, readings, now) {
  const latest = getLatestReading(readings);
  const reading = latest.reading;

  let status;
  let sensorHealth;
  if (
    latest.timestamp === null ||
    latest.timestamp > now + 5 * 60 * 1000 ||
    !isValidMoisture(reading.soilMoisture) ||
    (reading.sensor_status !== undefined &&
      reading.sensor_status !== "ok" &&
      reading.sensor_status !== "problem")
  ) {
    status = "Invalid Data";
    sensorHealth = "Invalid Data";
  } else if (
    reading.sensor_status === "problem" ||
    now - latest.timestamp > SENSOR_STALE_AFTER_MS
  ) {
    status = "Sensor Problem";
    sensorHealth = "Sensor Problem";
  } else {
    const moisture = reading.soilMoisture;
    status =
      moisture < DEFAULT_MOISTURE_RANGE.min
        ? "Dry"
        : moisture > DEFAULT_MOISTURE_RANGE.max
          ? "Too Wet"
          : "Healthy";
    sensorHealth = "Sensor OK";
  }

  return {
    cropName,
    status,
    sensorHealth,
    moisture: reading.soilMoisture,
    timestamp: latest.timestamp,
    moistureRange: DEFAULT_MOISTURE_RANGE,
  };
}

export function analyzeReadings(readings, now = Date.now()) {
  if (!Array.isArray(readings)) {
    throw new Error("The sensor feed must be a JSON array");
  }

  const readingsByCrop = new Map();
  for (const reading of readings) {
    if (
      reading === null ||
      typeof reading !== "object" ||
      typeof reading.crop_name !== "string" ||
      reading.crop_name.length === 0
    ) {
      continue;
    }

    const cropReadings = readingsByCrop.get(reading.crop_name) ?? [];
    cropReadings.push(reading);
    readingsByCrop.set(reading.crop_name, cropReadings);
  }

  return [...readingsByCrop].map(([cropName, cropReadings]) =>
    analyzeCropReadings(cropName, cropReadings, now),
  );
}
