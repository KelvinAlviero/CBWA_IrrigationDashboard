import React from "react";

const statusClasses = {
  Dry: "dry",
  Healthy: "healthy",
  "Sensor OK": "healthy",
  "Too Wet": "too-wet",
  "Sensor Problem": "sensor-problem",
  "Sensor Feed Unavailable": "sensor-problem",
  "Invalid Data": "invalid-data",
};

export default function DashboardCard({ crop, onEdit, onDelete }) {
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
          <dt>Soil moisture</dt>
          <dd>{moisture}</dd>
        </div>
        <div className="crop-detail">
          <dt>Recommended water</dt>
          <dd>{crop.recommendedWater}</dd>
        </div>
        <div className="crop-detail">
          <dt>Action</dt>
          <dd>{crop.action}</dd>
        </div>
        <div className="crop-detail">
          <dt>Target range</dt>
          <dd>
            {crop.targetMoistureMin}–{crop.targetMoistureMax}%
          </dd>
        </div>
        <div className="crop-detail">
          <dt>Location</dt>
          <dd>{crop.location}</dd>
        </div>
        <div className="crop-detail">
          <dt>Normal water</dt>
          <dd>{crop.normalWater} L</dd>
        </div>
        <div className="crop-detail">
          <dt>Last reading</dt>
          <dd>{timestamp}</dd>
        </div>
      </dl>
      {crop.invalidFields.length > 0 && (
        <p className="crop-alert invalid-data" role="alert">
          Invalid field: {crop.invalidFields.join(", ")}
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
      {crop.notes && <p className="crop-notes">{crop.notes}</p>}
      <div className="crop-card-actions">
        <button
          className="secondary-button"
          type="button"
          onClick={() => onEdit(crop)}
        >
          Edit
        </button>
        <button
          className="delete-button"
          type="button"
          onClick={() => onDelete(crop.cropName)}
        >
          Delete
        </button>
      </div>
    </article>
  );
}
