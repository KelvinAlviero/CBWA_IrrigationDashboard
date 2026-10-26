export const SENSOR_STALE_AFTER_MS = 24 * 60 * 60 * 1000;

function isValidMoisture(value) {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 100
  );
}

function getLatestReading(readings) {
  const timestamped = readings
    .map((reading) => ({
      reading,
      timestamp: Date.parse(reading.timestamp),
    }))
    .filter(({ timestamp }) => Number.isFinite(timestamp));

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
    !isValidMoisture(reading.soilMoisture) ||
    (reading.sensor_status !== undefined &&
      reading.sensor_status !== "ok" &&
      reading.sensor_status !== "problem")
  ) {
    return { status: "Invalid Data", sensorHealth: "Invalid Data" };
  }

  if (
    reading.sensor_status === "problem" ||
    now - timestamp > SENSOR_STALE_AFTER_MS
  ) {
    return { status: "Sensor Problem", sensorHealth: "Sensor Problem" };
  }

  if (reading.soilMoisture < crop.targetMoistureMin) {
    return { status: "Dry", sensorHealth: "Sensor OK" };
  }
  if (reading.soilMoisture > crop.targetMoistureMax) {
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
      moisture: latest.reading.soilMoisture,
      timestamp: latest.timestamp,
    };
  });
}
