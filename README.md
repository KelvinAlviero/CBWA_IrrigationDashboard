# CBWA Irrigation Dashboard

A basic React dashboard and Node.js API are available in [`smartfarm/`](./smartfarm/).

## Run locally

Install the frontend dependencies:

```sh
npm --prefix smartfarm/frontend install
```

Start the API in one terminal:

```sh
npm --prefix smartfarm start:backend
```

Start the Vite development server in another terminal:

```sh
npm --prefix smartfarm dev
```

The dashboard reads sample sensor data from `smartfarm/backend/data/sensor-readings.json`.
Each reading uses the exact, case-sensitive `crop_name` value to match sensor data
to a crop card. Cards show saved crop settings and the latest timestamped reading.
Readings older than 24 hours are marked as sensor problems, and moisture outside
0–100% is marked as invalid data.

The backend initializes a SQLite database at
`smartfarm/backend/data/crop-cards.sqlite` when it starts. Its schema is in
`smartfarm/backend/data/schema.sql`. The `crop_cards` table uses `crop_name` as a
case-sensitive primary key and is seeded with Tomatoes, Lettuce, and Corn profiles.
Seed values are examples; they are inserted only when a crop name is not already
present, and a one-time seed marker prevents deleted seed cards from returning on
restart. SQLite is provided by Node's built-in `node:sqlite` module, which requires
Node.js 22.5.0 or newer.

The dashboard adds only names found in the sensor feed, stores crop-card settings in
SQLite, and never writes to the sensor JSON. Refresh Sensor Data requests
`GET /api/readings` and updates the cards from the returned feed and the saved crop
profiles. Crop cards can be edited or deleted independently of their readings.

Run the backend API and dashboard logic tests with:

```sh
npm --prefix smartfarm test
```