import React, { useCallback, useEffect, useState } from "react";
import DashboardCard from "./components/DashboardCard.jsx";
import { getReadings } from "./services/api.js";
import { analyzeReadings } from "./utils/analysis.js";

export default function App() {
  const [crops, setCrops] = useState(null);
  const [error, setError] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);

  const refreshReadings = useCallback(async () => {
    setIsRefreshing(true);
    setError("");
    try {
      const readings = await getReadings();
      setCrops(analyzeReadings(readings));
      setLastUpdated(new Date());
    } catch (refreshError) {
      setError(refreshError.message);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refreshReadings();
  }, [refreshReadings]);

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="GreenFields Farm home">
          GreenFields Farm
        </a>
        <span className="topbar-label">Crop conditions</span>
      </header>

      <main className="main-content">
        <section className="dashboard-panel" aria-labelledby="dashboard-title">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">SENSOR OVERVIEW</p>
              <h1 id="dashboard-title">Crop conditions</h1>
              <p className="panel-description">
                The latest soil moisture reading for each crop.
              </p>
            </div>
            <button
              className="refresh-button"
              type="button"
              onClick={refreshReadings}
              disabled={isRefreshing}
            >
              <span aria-hidden="true">{isRefreshing ? "↻" : "⟳"}</span>
              {isRefreshing ? "Refreshing..." : "Refresh readings"}
            </button>
          </div>

          {error && (
            <p className="message error-message" role="alert">
              Could not refresh sensor readings: {error}
            </p>
          )}

          {crops === null ? (
            !error && (
              <p className="message" role="status">
                Loading crop conditions...
              </p>
            )
          ) : crops.length === 0 ? (
            <p className="empty-state">
              No crop names were found in the sensor feed.
            </p>
          ) : (
            <div className="crop-grid">
              {crops.map((crop) => (
                <DashboardCard crop={crop} key={crop.cropName} />
              ))}
            </div>
          )}

          <p className="reading-count" aria-live="polite">
            {lastUpdated
              ? `Updated ${lastUpdated.toLocaleTimeString()}`
              : "Waiting for sensor readings"}
            {" · "}
            Default target range: 30–70% until crop settings are added.
          </p>
        </section>
      </main>
    </div>
  );
}
