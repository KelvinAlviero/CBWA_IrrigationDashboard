import React from "react";
import SensorHistory from "./SensorHistory.jsx";

const statusClasses = {
  Dry: "dry",
  Healthy: "healthy",
  "Too Wet": "too-wet",
  "Sensor Problem": "sensor-problem",
  "Sensor Feed Unavailable": "sensor-problem",
  "Invalid Data": "invalid-data",
};

export default function DashboardCard({
  crop,
  onEdit,
  onDelete,
  onToggleHistory,
  isHistoryOpen,
  readings,
}) {
  const timestamp = crop.latest_reading?.timestamp
    ? new Date(`${crop.latest_reading.timestamp}Z`).toLocaleString()
    : "Unavailable";
  const moisture =
    typeof crop.latest_reading?.soil_moisture === "number" &&
    Number.isFinite(crop.latest_reading.soil_moisture)
      ? `${crop.latest_reading.soil_moisture}%`
      : "Unavailable";
  const temperature =
    typeof crop.latest_reading?.temperature === "number" &&
    Number.isFinite(crop.latest_reading.temperature)
      ? `${crop.latest_reading.temperature} °C`
      : "Unavailable";
  const rainfall =
    typeof crop.latest_reading?.rainfall === "number" &&
    Number.isFinite(crop.latest_reading.rainfall)
      ? `${crop.latest_reading.rainfall} mm`
      : "Unavailable";

  return (
    <article className="crop-card">
      <div className="crop-card-heading">
        <h2>{crop.crop.crop_name}</h2>
        <span className={`status-badge ${statusClasses[crop.condition]}`}>
          {crop.condition}
        </span>
      </div>
      <dl className="crop-details">
        <div className="crop-detail">
          <dt>Sensor health</dt>
          <dd className={`sensor-health ${statusClasses[crop.condition]}`}>
            <span aria-hidden="true" />
            {crop.condition === "Healthy" ||
            crop.condition === "Dry" ||
            crop.condition === "Too Wet"
              ? "Sensor OK"
              : crop.condition}
          </dd>
        </div>
        <div className="crop-detail">
          <dt>Soil moisture</dt>
          <dd>{moisture}</dd>
        </div>
        <div className="crop-detail">
          <dt>Temperature</dt>
          <dd>{temperature}</dd>
        </div>
        <div className="crop-detail">
          <dt>Rainfall</dt>
          <dd>{rainfall}</dd>
        </div>
        <div className="crop-detail">
          <dt>Recommended water</dt>
          <dd>{crop.recommended_water}</dd>
        </div>
        <div className="crop-detail">
          <dt>Action</dt>
          <dd>{crop.action}</dd>
        </div>
        <div className="crop-detail">
          <dt>Target range</dt>
          <dd>
            {crop.crop.target_min}–{crop.crop.target_max}%
          </dd>
        </div>
        <div className="crop-detail">
          <dt>Location</dt>
          <dd>{crop.crop.location}</dd>
        </div>
        <div className="crop-detail">
          <dt>Normal water</dt>
          <dd>{crop.crop.normal_water} L</dd>
        </div>
        <div className="crop-detail">
          <dt>Last reading</dt>
          <dd>{timestamp}</dd>
        </div>
      </dl>
      {crop.invalid_fields.length > 0 && (
        <p className="crop-alert invalid-data" role="alert">
          Invalid field: {crop.invalid_fields.join(", ")}
        </p>
      )}
      {crop.alerts.length > 0 && (
        <ul className="crop-alert-list" aria-label="Additional sensor alerts">
          {crop.alerts.map((alert) => (
            <li className="crop-alert" key={alert}>
              {alert}
            </li>
          ))}
        </ul>
      )}
      {crop.crop.notes && <p className="crop-notes">{crop.crop.notes}</p>}
      <div className="crop-card-actions">
        <button
          className="secondary-button"
          type="button"
          onClick={onToggleHistory}
        >
          {isHistoryOpen ? "Hide history" : "Sensor History"}
        </button>
        <button
          className="secondary-button"
          type="button"
          onClick={onEdit}
        >
          Edit
        </button>
        <button
          className="delete-button"
          type="button"
          onClick={onDelete}
        >
          Delete
        </button>
      </div>
      {isHistoryOpen && (
        <SensorHistory crop={crop.crop} readings={readings} />
      )}
    </article>
  );
}
