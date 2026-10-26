CREATE TABLE IF NOT EXISTS crops (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  crop_name TEXT NOT NULL COLLATE BINARY UNIQUE
    CHECK (length(trim(crop_name)) > 0),
  location TEXT NOT NULL
    CHECK (length(trim(location)) BETWEEN 1 AND 100),
  target_min REAL NOT NULL
    CHECK (target_min >= 0 AND target_min <= 100),
  target_max REAL NOT NULL
    CHECK (target_max >= 0 AND target_max <= 100),
  normal_water REAL NOT NULL
    CHECK (normal_water > 0 AND normal_water <= 10000),
  notes TEXT NOT NULL DEFAULT ''
    CHECK (length(notes) <= 500),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now')),
  CHECK (target_min < target_max)
);
