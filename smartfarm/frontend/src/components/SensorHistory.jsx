import React from "react";
import { analyseCrop } from "../utils/analysis.js";

export default function SensorHistory({ crop, readings }) {
  const history = [...readings]
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .map((reading) => analyseCrop(crop, reading));

  return (
    <section className="sensor-history" aria-label={`${crop.crop_name} sensor history`}>
      <h3>Sensor History</h3>
      {history.length === 0 ? (
        <p>No sensor readings available.</p>
      ) : (
        <ul>
          {history.map((result) => (
            <li key={result.latest_reading.timestamp}>
              <div>
                <strong>{result.condition}</strong>
                <span>{result.latest_reading.timestamp}</span>
              </div>
              <span>
                {result.latest_reading.soil_moisture}% moisture ·{" "}
                {result.latest_reading.temperature}°C ·{" "}
                {result.latest_reading.rainfall} mm rain ·{" "}
                {result.latest_reading.sensor_status} ·{" "}
                {result.recommended_water} · {result.action}
              </span>
              {result.latest_reading.notes && (
                <span>{result.latest_reading.notes}</span>
              )}
              {result.alerts.length > 0 && (
                <span>{result.alerts.join(" · ")}</span>
              )}
              {result.invalid_fields.length > 0 && (
                <span className="invalid-data">
                  Invalid field: {result.invalid_fields.join(", ")}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
