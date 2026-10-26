async function requestJson(path, options) {
  const response = await fetch(path, {
    cache: "no-store",
    ...options,
    headers: {
      ...(options?.body ? { "Content-Type": "application/json" } : {}),
      ...options?.headers,
    },
  });

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = await response.json();
      if (typeof body.error === "string") message = body.error;
    } catch {
      // Keep the HTTP status message when the server response is not JSON.
    }
    throw new Error(message);
  }

  if (response.status === 204) return null;
  return response.json();
}

function fromDatabaseRow(row) {
  return {
    cropName: row.crop_name,
    location: row.location,
    targetMoistureMin: row.target_moisture_min,
    targetMoistureMax: row.target_moisture_max,
    normalWaterAmount: row.normal_water_amount,
    normalWaterUnit: row.normal_water_unit,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toDatabaseFields(crop) {
  return {
    location: crop.location,
    targetMoistureMin: Number(crop.targetMoistureMin),
    targetMoistureMax: Number(crop.targetMoistureMax),
    normalWaterAmount: Number(crop.normalWaterAmount),
    normalWaterUnit: crop.normalWaterUnit,
    notes: crop.notes,
  };
}

export async function getReadings() {
  const readings = await requestJson("/api/readings");
  if (!Array.isArray(readings)) {
    throw new Error("The sensor feed must be a JSON array");
  }
  return readings;
}

export async function getCropCards() {
  const rows = await requestJson("/api/crops");
  if (!Array.isArray(rows)) {
    throw new Error("The crop card response must be a JSON array");
  }
  return rows.map(fromDatabaseRow);
}

export async function getCropOptions() {
  const cropNames = await requestJson("/api/crop-options");
  if (!Array.isArray(cropNames) || !cropNames.every((name) => typeof name === "string")) {
    throw new Error("The crop options response is invalid");
  }
  return cropNames;
}

export async function createCropCard(cropName, crop) {
  const row = await requestJson("/api/crops", {
    method: "POST",
    body: JSON.stringify({ cropName, ...toDatabaseFields(crop) }),
  });
  return fromDatabaseRow(row);
}

export async function updateCropCard(cropName, crop) {
  const row = await requestJson(`/api/crops/${encodeURIComponent(cropName)}`, {
    method: "PUT",
    body: JSON.stringify(toDatabaseFields(crop)),
  });
  return fromDatabaseRow(row);
}

export async function deleteCropCard(cropName) {
  return requestJson(`/api/crops/${encodeURIComponent(cropName)}`, {
    method: "DELETE",
  });
}
