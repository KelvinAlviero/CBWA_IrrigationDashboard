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
    crop_name: "Tomato",
    location: "Greenhouse A",
    target_min: 55,
    target_max: 75,
    normal_water: 500,
    notes: "",
  },
  {
    crop_name: "Lettuce",
    location: "Greenhouse B",
    target_min: 60,
    target_max: 80,
    normal_water: 400,
    notes: "",
  },
  {
    crop_name: "Wheat",
    location: "North Field",
    target_min: 35,
    target_max: 55,
    normal_water: 300,
    notes: "",
  },
];

export const cropDatabase = new DatabaseSync(databasePath);
cropDatabase.exec("PRAGMA journal_mode = WAL;");
const schema = await readFile(fileURLToPath(schemaPath), "utf8");

const insertCrop = `
  INSERT OR IGNORE INTO crops (
    crop_name, location, target_min, target_max, normal_water, notes
  ) VALUES (
    $crop_name, $location, $target_min, $target_max, $normal_water, $notes
  )
`;

export function initializeDatabase(database = cropDatabase) {
  database.exec("BEGIN");
  try {
    const tables = new Set(
      database
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all()
        .map(({ name }) => name),
    );
    database.exec(schema);

    if (tables.has("crop_cards")) {
      const legacyCards = database.prepare("SELECT * FROM crop_cards").all();
      const migrateCrop = database.prepare(`
        INSERT OR IGNORE INTO crops (
          crop_name, location, target_min, target_max, normal_water, notes, created_at
        ) VALUES (
          $crop_name, $location, $target_min, $target_max, $normal_water, $notes,
          $created_at
        )
      `);
      for (const crop of legacyCards) {
        migrateCrop.run({
          crop_name: crop.crop_name,
          location: crop.location,
          target_min: crop.target_moisture_min,
          target_max: crop.target_moisture_max,
          normal_water: crop.normal_water_amount,
          notes: crop.notes ?? "",
          created_at: crop.created_at,
        });
      }
      database.exec("DROP TABLE crop_cards");
    }
    if (tables.has("app_metadata")) {
      database.exec("DROP TABLE app_metadata");
    }

    const cropCount = database
      .prepare("SELECT COUNT(*) AS count FROM crops")
      .get().count;
    if (cropCount === 0) {
      const seedCrop = database.prepare(insertCrop);
      for (const crop of seedCrops) seedCrop.run(crop);
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
    .prepare("SELECT * FROM crops ORDER BY crop_name COLLATE BINARY")
    .all();
}

export function getCropCard(cropName, database = cropDatabase) {
  return database
    .prepare("SELECT * FROM crops WHERE crop_name = ?")
    .get(cropName);
}

export function getCropCardById(id, database = cropDatabase) {
  return database.prepare("SELECT * FROM crops WHERE id = ?").get(id);
}

export function createCropCard(crop, database = cropDatabase) {
  return database.prepare(insertCrop).run(crop);
}

export function updateCropCardById(id, crop, database = cropDatabase) {
  return database
    .prepare(`
      UPDATE crops
      SET location = $location,
          target_min = $target_min,
          target_max = $target_max,
          normal_water = $normal_water,
          notes = $notes
      WHERE id = $id
    `)
    .run({ ...crop, id });
}

export function deleteCropCardById(id, database = cropDatabase) {
  return database
    .prepare("DELETE FROM crops WHERE id = ?")
    .run(id);
}

export async function getSensorReadings() {
  const contents = await readFile(fileURLToPath(readingsPath), "utf8");
  return JSON.parse(contents);
}
