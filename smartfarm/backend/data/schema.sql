CREATE TABLE IF NOT EXISTS crop_cards (
  crop_name TEXT PRIMARY KEY COLLATE BINARY
    CHECK (length(trim(crop_name)) > 0),
  location TEXT NOT NULL DEFAULT '',
  target_moisture_min REAL NOT NULL
    CHECK (target_moisture_min >= 0 AND target_moisture_min <= 100),
  target_moisture_max REAL NOT NULL
    CHECK (target_moisture_max >= 0 AND target_moisture_max <= 100),
  normal_water_amount REAL NOT NULL
    CHECK (normal_water_amount >= 0),
  normal_water_unit TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (target_moisture_min <= target_moisture_max)
);

CREATE TABLE IF NOT EXISTS app_metadata (
  key TEXT PRIMARY KEY COLLATE BINARY,
  value TEXT NOT NULL
);
