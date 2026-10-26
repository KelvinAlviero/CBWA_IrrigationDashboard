import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const readingsPath = new URL("./data/sensor-readings.json", import.meta.url);
const schemaPath = new URL("./data/schema.sql", import.meta.url);
const databasePath =
  process.env.SMARTFARM_DB_PATH ??
  resolve(fileURLToPath(new URL("./data/crop-cards.sqlite", import.meta.url)));

const seedCrops = [
  {
    cropName: "Tomatoes",
    location: "Greenhouse A",
    targetMoistureMin: 30,
    targetMoistureMax: 70,
    normalWaterAmount: 2,
    normalWaterUnit: "L/plant/day",
    notes: "Seed profile; adjust for local growing conditions.",
  },
  {
    cropName: "Lettuce",
    location: "North field",
    targetMoistureMin: 40,
    targetMoistureMax: 75,
    normalWaterAmount: 1,
    normalWaterUnit: "L/plant/day",
    notes: "Seed profile; adjust for local growing conditions.",
  },
  {
    cropName: "Corn",
    location: "East field",
    targetMoistureMin: 35,
    targetMoistureMax: 70,
    normalWaterAmount: 3,
    normalWaterUnit: "L/plant/day",
    notes: "Seed profile; adjust for local growing conditions.",
  },
];

export const cropDatabase = new DatabaseSync(databasePath);
cropDatabase.exec("PRAGMA journal_mode = WAL;");
const schema = await readFile(fileURLToPath(schemaPath), "utf8");

const seedCropsStatement = `
  INSERT OR IGNORE INTO crop_cards (
    crop_name,
    location,
    target_moisture_min,
    target_moisture_max,
    normal_water_amount,
    normal_water_unit,
    notes
  ) VALUES (
    $cropName,
    $location,
    $targetMoistureMin,
    $targetMoistureMax,
    $normalWaterAmount,
    $normalWaterUnit,
    $notes
  )
`;

export function initializeDatabase(database = cropDatabase) {
  database.exec(schema);
  const seedCrop = database.prepare(seedCropsStatement);
  database.exec("BEGIN");
  try {
    for (const crop of seedCrops) {
      seedCrop.run(crop);
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

initializeDatabase();

export function listCropCards(database = cropDatabase) {
  return database
    .prepare("SELECT * FROM crop_cards ORDER BY crop_name COLLATE BINARY")
    .all();
}

export function getCropCard(cropName, database = cropDatabase) {
  return database
    .prepare("SELECT * FROM crop_cards WHERE crop_name = ?")
    .get(cropName);
}

export function createCropCard(crop, database = cropDatabase) {
  return database
    .prepare(`
      INSERT INTO crop_cards (
        crop_name,
        location,
        target_moisture_min,
        target_moisture_max,
        normal_water_amount,
        normal_water_unit,
        notes
      ) VALUES (
        $cropName,
        $location,
        $targetMoistureMin,
        $targetMoistureMax,
        $normalWaterAmount,
        $normalWaterUnit,
        $notes
      )
    `)
    .run(crop);
}

export function updateCropCard(cropName, crop, database = cropDatabase) {
  return database
    .prepare(`
      UPDATE crop_cards
      SET location = $location,
          target_moisture_min = $targetMoistureMin,
          target_moisture_max = $targetMoistureMax,
          normal_water_amount = $normalWaterAmount,
          normal_water_unit = $normalWaterUnit,
          notes = $notes,
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE crop_name = $cropName
    `)
    .run({ ...crop, cropName });
}

export function deleteCropCard(cropName, database = cropDatabase) {
  return database
    .prepare("DELETE FROM crop_cards WHERE crop_name = ?")
    .run(cropName);
}

export async function getSensorReadings() {
  const contents = await readFile(fileURLToPath(readingsPath), "utf8");
  return JSON.parse(contents);
}
