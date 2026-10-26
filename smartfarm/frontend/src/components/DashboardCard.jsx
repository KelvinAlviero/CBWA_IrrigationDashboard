import React from "react";

const statusClasses = {
  Dry: "dry",
  Healthy: "healthy",
  "Too Wet": "too-wet",
  "Sensor Problem": "sensor-problem",
  "Invalid Data": "invalid-data",
};

export default function DashboardCard({ crop }) {
  const timestamp = crop.timestamp
    ? new Date(crop.timestamp).toLocaleString()
    : "Unavailable";
  const moisture =
    typeof crop.moisture === "number" && Number.isFinite(crop.moisture)
      ? `${crop.moisture}%`
      : "Unavailable";

  return (
    <article className="crop-card">
      <div className="crop-card-heading">
        <h2>{crop.cropName}</h2>
        <span className={`status-badge ${statusClasses[crop.status]}`}>
          {crop.status}
        </span>
      </div>
      <dl className="crop-details">
        <div className="crop-detail">
          <dt>Sensor health</dt>
          <dd className={`sensor-health ${statusClasses[crop.sensorHealth]}`}>
            <span aria-hidden="true" />
            {crop.sensorHealth}
          </dd>
        </div>
        <div className="crop-detail">
          <dt>Latest soil moisture</dt>
          <dd>{moisture}</dd>
        </div>
        <div className="crop-detail">
          <dt>Target range</dt>
          <dd>
            {crop.moistureRange.min}–{crop.moistureRange.max}%
          </dd>
        </div>
        <div className="crop-detail">
          <dt>Last reading</dt>
          <dd>{timestamp}</dd>
        </div>
      </dl>
    </article>
  );
}
