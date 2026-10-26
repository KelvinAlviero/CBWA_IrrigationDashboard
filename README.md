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
Each reading uses the exact, case-sensitive `crop_name` value to group readings into
crop cards. Cards show the most recent valid timestamp, sensor health, and moisture
status. Until editable crop settings are implemented, all crops use a default target
range of 30–70%. Readings older than 24 hours are marked as sensor problems, and
moisture outside 0–100% is marked as invalid data.

The backend initializes a SQLite database at
`smartfarm/backend/data/crop-cards.sqlite` when it starts. Its schema is in
`smartfarm/backend/data/schema.sql`. The `crop_cards` table uses `crop_name` as a
case-sensitive primary key and is seeded with Tomatoes, Lettuce, and Corn profiles.
Seed values are examples; they are inserted only when a crop name is not already
present, so existing profile edits are preserved. SQLite is provided by Node's
built-in `node:sqlite` module, which requires Node.js 22.5.0 or newer.

Run the dashboard logic tests with:

```sh
npm --prefix smartfarm/frontend test
```