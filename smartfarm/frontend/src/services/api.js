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
    id: row.id,
    cropName: row.crop_name,
    location: row.location,
    targetMoistureMin: row.target_min,
    targetMoistureMax: row.target_max,
    normalWater: row.normal_water,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

function toDatabaseFields(crop, includeCropName = true) {
  return {
    ...(includeCropName ? { crop_name: crop.cropName } : {}),
    location: crop.location,
    target_min: Number(crop.targetMoistureMin),
    target_max: Number(crop.targetMoistureMax),
    normal_water: Number(crop.normalWater),
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
    body: JSON.stringify({ ...toDatabaseFields(crop), crop_name: cropName }),
  });
  return fromDatabaseRow(row);
}

export async function getCropCard(id) {
  return fromDatabaseRow(await requestJson(`/api/crops/${id}`));
}

export async function updateCropCard(id, crop) {
  const row = await requestJson(`/api/crops/${id}`, {
    method: "PUT",
    body: JSON.stringify(toDatabaseFields(crop, false)),
  });
  return fromDatabaseRow(row);
}

export async function deleteCropCard(id) {
  return requestJson(`/api/crops/${id}`, {
    method: "DELETE",
  });
}
