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

The dashboard reads simulated IoT data from
`smartfarm/backend/data/sensor-readings.json`; it does not connect to hardware,
MQTT, or a cloud service. The file contains 20 readings, five each for Tomato,
Lettuce, Wheat, and Maize. Readings use `crop_name`, `timestamp`,
`soil_moisture`, `temperature`, `rainfall`, `sensor_status`, and `notes`. Crop names
and sensor statuses use the exact values specified by the feed contract. Each
reading uses the exact, case-sensitive `crop_name` value to match sensor data to a
crop card. Cards show saved crop settings and the latest timestamped reading. Crop
conditions follow the dashboard decision table: Offline/Faulty readings are Sensor
Problem, out-of-range Online readings are Invalid Data, and valid Online readings
are Dry, Healthy, or Too Wet based on the saved moisture range. Cards also show
recommended water, action, and valid-reading temperature/rain alerts. Overall Farm
Status summarizes the current cards as No Crops, Sensor Feed Unavailable, Critical,
Watch, or Normal.

The backend initializes a SQLite database at
`smartfarm/backend/data/crop-cards.sqlite` when it starts. Its schema is in
`smartfarm/backend/data/schema.sql`. The `crops` table contains an automatic integer
ID and a unique, case-sensitive `crop_name`, plus location, target moisture bounds,
normal water in litres, notes, and a SQLite-generated creation timestamp. An empty
table is seeded with Tomato (Greenhouse A, 55–75%, 500 L), Lettuce (Greenhouse B,
60–80%, 400 L), and Wheat (North Field, 35–55%, 300 L). Maize is not seeded. Existing
profiles from the previous schema are migrated and preserved. SQLite is provided by
Node's built-in `node:sqlite` module, which requires Node.js 22.5.0 or newer.

Create and edit requests use `crop_name`, `location`, `target_min`, `target_max`,
`normal_water`, and optional `notes`. Numeric values must be JSON numbers. The API
validates moisture bounds, location length, positive water amounts up to 10,000 L,
and notes up to 500 characters. Crop names are selected from the sensor feed; editing
cannot change a crop name.

Crop Card routes use SQLite IDs: `GET /api/crops/:id`, `PUT /api/crops/:id`, and
`DELETE /api/crops/:id`. Delete returns HTTP 200 with `{ "deleted": true, "id": n }`.
API errors are JSON objects containing an `error` message; unexpected backend
failures return HTTP 500 with `Internal server error`.

The dashboard adds only names found in the sensor feed, stores crop-card settings in
SQLite, and never writes to the sensor JSON. `GET /api/readings` reads the JSON file
on every request, so Refresh Sensor Data picks up file changes without restarting
the API. Crop-card CRUD never modifies the sensor JSON. Crop cards can be edited or
deleted independently of their readings.

On load, the frontend requests Crop Cards and sensor readings independently. Crop
Card failures show a Retry action; sensor failures preserve loaded Crop Cards and
show Sensor Feed Unavailable until a successful sensor response. Refresh replaces
the in-memory readings only on success. The “Last refresh” time is held in React
state, starts as “Never”, and changes only after a successful readings request.
Create options are derived from the current readings and Crop Cards. The reusable
analysis functions live in
[`analysis.js`](./smartfarm/frontend/src/utils/analysis.js); dashboard cards and
their Sensor History view use the same per-reading analysis.

The local API uses port 3004 and Vite uses port 5178 to avoid conflicts with older
SmartFarm processes that may still be running on the previous ports.

Run the backend API and dashboard logic tests with:

```sh
npm --prefix smartfarm test
```