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

function isBusinessRangeInvalid(value, { minimum, maximum }) {
  return !isFiniteNumber(value) || value < minimum || value > maximum;
}

function isValidTimestamp(value) {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(`${value}Z`)) &&
    new Date(Date.parse(`${value}Z`)).toISOString().slice(0, 19) === value
  );
}

export function getAvailableCropNames(readings, crops) {
  if (!Array.isArray(readings) || !Array.isArray(crops)) {
    throw new Error("Readings and crop cards must be arrays");
  }
  const usedCropNames = new Set(crops.map((crop) => crop.cropName));
  return [
    ...new Set(
      readings
        .map((reading) => reading?.crop_name)
        .filter((cropName) => VALID_CROP_NAMES.has(cropName)),
    ),
  ]
    .filter((cropName) => !usedCropNames.has(cropName))
    .sort();
}

export function getLatestReading(cropName, readings) {
  if (!Array.isArray(readings)) {
    throw new Error("The sensor feed must be a JSON array");
  }
  return (
    [...readings]
      .filter((reading) => reading?.crop_name === cropName)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0] ?? null
  );
}

function getInvalidFields(reading) {
  const invalidFields = [];
  if (!VALID_CROP_NAMES.has(reading.crop_name)) invalidFields.push("Crop name");
  if (!VALID_SENSOR_STATUSES.has(reading.sensor_status)) {
    invalidFields.push("Sensor status");
  }
  if (!isValidTimestamp(reading.timestamp)) invalidFields.push("Timestamp");
  if (typeof reading.notes !== "string") invalidFields.push("Notes");

  for (const [field, range] of Object.entries(BUSINESS_RANGES)) {
    if (isBusinessRangeInvalid(reading[field], range)) {
      const value = reading[field];
      invalidFields.push(
        `${range.label} (${isFiniteNumber(value) ? value : "not a number"}; allowed ${range.minimum}-${range.maximum})`,
      );
    }
  }
  return invalidFields;
}

export function analyseCrop(cropCard, reading) {
  const crop = {
    id: cropCard.id,
    crop_name: cropCard.crop_name ?? cropCard.cropName,
    location: cropCard.location,
    target_min: cropCard.target_min ?? cropCard.targetMoistureMin,
    target_max: cropCard.target_max ?? cropCard.targetMoistureMax,
    normal_water: cropCard.normal_water ?? cropCard.normalWater,
    notes: cropCard.notes ?? "",
  };
  const result = {
    crop,
    latest_reading: reading
      ? {
          timestamp: reading.timestamp,
          soil_moisture: reading.soil_moisture,
          temperature: reading.temperature,
          rainfall: reading.rainfall,
          sensor_status: reading.sensor_status,
          notes: reading.notes,
        }
      : null,
    condition: "",
    recommended_water: "",
    alerts: [],
    action: "",
    invalid_fields: [],
  };

  if (!reading || reading.sensor_status === "Offline" || reading.sensor_status === "Faulty") {
    return {
      ...result,
      condition: "Sensor Problem",
      recommended_water: "N/A",
      action: "Check sensor",
    };
  }

  const invalidFields = getInvalidFields(reading);
  if (invalidFields.length > 0) {
    return {
      ...result,
      condition: "Invalid Data",
      recommended_water: "N/A",
      action: "Check reading",
      invalid_fields: invalidFields,
    };
  }

  const alerts = [];
  if (reading.temperature > 35) alerts.push("High temperature");
  if (reading.rainfall >= 5) alerts.push("Rain detected");

  if (reading.soil_moisture < crop.target_min) {
    return {
      ...result,
      condition: "Dry",
      recommended_water: `${crop.normal_water} L`,
      alerts,
      action: "Water crop",
    };
  }
  if (reading.soil_moisture <= crop.target_max) {
    return {
      ...result,
      condition: "Healthy",
      recommended_water: "0 L",
      alerts,
      action: "Monitor",
    };
  }
  return {
    ...result,
    condition: "Too Wet",
    recommended_water: "0 L",
    alerts,
    action: "Stop watering",
  };
}

export function analyseCropCards(cropCards, readings) {
  if (!Array.isArray(cropCards) || !Array.isArray(readings)) {
    throw new Error("Crop cards and readings must be arrays");
  }
  return cropCards.map((crop) =>
    analyseCrop(crop, getLatestReading(crop.cropName ?? crop.crop_name, readings)),
  );
}

export function createUnavailableCropCards(cropCards) {
  return cropCards.map((crop) => ({
    crop: {
      id: crop.id,
      crop_name: crop.cropName,
      location: crop.location,
      target_min: crop.targetMoistureMin,
      target_max: crop.targetMoistureMax,
      normal_water: crop.normalWater,
      notes: crop.notes ?? "",
    },
    latest_reading: null,
    condition: "Sensor Feed Unavailable",
    recommended_water: "N/A",
    alerts: [],
    action: "Refresh sensor data",
    invalid_fields: [],
  }));
}

export function calculateFarmStatus(results, hasSuccessfulSensorData = true) {
  if (!Array.isArray(results)) {
    throw new Error("Crop results must be an array");
  }
  if (results.length === 0) return "No Crops";
  if (!hasSuccessfulSensorData) return "Sensor Feed Unavailable";
  if (
    results.some(
      ({ condition }) =>
        condition === "Sensor Problem" || condition === "Invalid Data",
    )
  ) {
    return "Critical";
  }
  if (
    results.some(
      ({ condition, alerts }) =>
        condition === "Dry" ||
        condition === "Too Wet" ||
        alerts?.includes("High temperature"),
    )
  ) {
    return "Watch";
  }
  return "Normal";
}
