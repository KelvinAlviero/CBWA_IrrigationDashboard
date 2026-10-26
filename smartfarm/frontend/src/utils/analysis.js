export const SENSOR_STALE_AFTER_MS = 24 * 60 * 60 * 1000;

const VALID_CROP_NAMES = new Set(["Tomato", "Lettuce", "Wheat", "Maize"]);
const VALID_SENSOR_STATUSES = new Set(["Online", "Offline", "Faulty"]);

function isValidMoisture(value) {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 100
  );
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

function isValidReading(reading) {
  return (
    VALID_CROP_NAMES.has(reading.crop_name) &&
    parseTimestamp(reading.timestamp) !== null &&
    isValidMoisture(reading.soil_moisture) &&
    typeof reading.temperature === "number" &&
    Number.isFinite(reading.temperature) &&
    reading.temperature >= 0 &&
    reading.temperature <= 50 &&
    typeof reading.rainfall === "number" &&
    Number.isFinite(reading.rainfall) &&
    reading.rainfall >= 0 &&
    reading.rainfall <= 50 &&
    VALID_SENSOR_STATUSES.has(reading.sensor_status) &&
    typeof reading.notes === "string"
  );
}

function getLatestReading(readings) {
  const timestamped = readings
    .map((reading) => ({
      reading,
      timestamp: parseTimestamp(reading.timestamp),
    }))
    .filter(({ timestamp }) => timestamp !== null);

  if (timestamped.length === 0) {
    return { reading: readings.at(-1), timestamp: null };
  }

  const latest = timestamped.reduce((newest, candidate) =>
    candidate.timestamp >= newest.timestamp ? candidate : newest,
  );

  return latest;
}

function getCropStatus(reading, timestamp, crop, now) {
  if (
    timestamp === null ||
    timestamp > now + 5 * 60 * 1000 ||
    !isValidReading(reading)
  ) {
    return { status: "Invalid Data", sensorHealth: "Invalid Data" };
  }

  if (
    reading.sensor_status === "Offline" ||
    reading.sensor_status === "Faulty" ||
    now - timestamp > SENSOR_STALE_AFTER_MS
  ) {
    return { status: "Sensor Problem", sensorHealth: "Sensor Problem" };
  }

  if (reading.soil_moisture < crop.targetMoistureMin) {
    return { status: "Dry", sensorHealth: "Sensor OK" };
  }
  if (reading.soil_moisture > crop.targetMoistureMax) {
    return { status: "Too Wet", sensorHealth: "Sensor OK" };
  }
  return { status: "Healthy", sensorHealth: "Sensor OK" };
}

export function analyzeCropCards(cropCards, readings, now = Date.now()) {
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
    const cropReadings = readingsByCrop.get(crop.cropName) ?? [];
    if (cropReadings.length === 0) {
      return {
        ...crop,
        status: "Sensor Problem",
        sensorHealth: "Sensor Problem",
        moisture: null,
        timestamp: null,
      };
    }

    const latest = getLatestReading(cropReadings);
    const { status, sensorHealth } = getCropStatus(
      latest.reading,
      latest.timestamp,
      crop,
      now,
    );

    return {
      ...crop,
      status,
      sensorHealth,
      moisture: latest.reading.soil_moisture,
      timestamp: latest.timestamp,
    };
  });
}
