import React, { useCallback, useEffect, useState } from "react";
import CropCardForm from "./components/CropCardForm.jsx";
import DashboardCard from "./components/DashboardCard.jsx";
import {
  createCropCard,
  deleteCropCard,
  getCropCards,
  getCropOptions,
  getReadings,
  updateCropCard,
} from "./services/api.js";
import { analyzeCropCards } from "./utils/analysis.js";

async function loadDashboardData() {
  const [cropCards, readings] = await Promise.all([
    getCropCards(),
    getReadings(),
  ]);
  return analyzeCropCards(cropCards, readings);
}

export default function App() {
  const [crops, setCrops] = useState(null);
  const [error, setError] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [formCrop, setFormCrop] = useState(null);
  const [cropOptions, setCropOptions] = useState([]);
  const [newCropName, setNewCropName] = useState("");

  const refreshReadings = useCallback(async () => {
    setIsRefreshing(true);
    setError("");
    try {
      const latestCrops = await loadDashboardData();
      setCrops(latestCrops);
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

  async function openAddForm() {
    setError("");
    try {
      const options = await getCropOptions();
      setCropOptions(options);
      setNewCropName(options[0] ?? "");
      setFormCrop({ mode: "add" });
    } catch (loadError) {
      setError(`Could not load available crops: ${loadError.message}`);
    }
  }

  async function handleSave(profile) {
    setIsSaving(true);
    setError("");
    try {
      if (formCrop?.mode === "edit") {
        await updateCropCard(formCrop.crop.cropName, profile);
      } else {
        await createCropCard(profile.cropName, profile);
      }
      const latestCrops = await loadDashboardData();
      setCrops(latestCrops);
      setLastUpdated(new Date());
      setFormCrop(null);
    } catch (saveError) {
      setError(`Could not save crop card: ${saveError.message}`);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(cropName) {
    setError("");
    try {
      await deleteCropCard(cropName);
      const latestCrops = await loadDashboardData();
      setCrops(latestCrops);
      setLastUpdated(new Date());
      if (formCrop?.mode === "edit" && formCrop.crop.cropName === cropName) {
        setFormCrop(null);
      }
    } catch (deleteError) {
      setError(`Could not delete crop card: ${deleteError.message}`);
    }
  }

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
                Manage crop profiles and view their latest sensor readings.
              </p>
            </div>
            <div className="panel-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={openAddForm}
                disabled={isSaving || isRefreshing}
              >
                Add Crop Card
              </button>
              <button
                className="refresh-button"
                type="button"
                onClick={refreshReadings}
                disabled={isRefreshing || isSaving}
              >
                <span aria-hidden="true">{isRefreshing ? "↻" : "⟳"}</span>
                {isRefreshing ? "Refreshing..." : "Refresh Sensor Data"}
              </button>
            </div>
          </div>

          {error && (
            <p className="message error-message" role="alert">
              {error}
            </p>
          )}

          {formCrop && (
            <CropCardForm
              key={
                formCrop.mode === "edit"
                  ? `edit-${formCrop.crop.cropName}`
                  : "add-crop"
              }
              crop={formCrop.mode === "edit" ? formCrop.crop : null}
              cropOptions={cropOptions}
              cropName={newCropName}
              onCropNameChange={setNewCropName}
              onCancel={() => setFormCrop(null)}
              onSubmit={handleSave}
              isSaving={isSaving}
            />
          )}

          {crops === null ? (
            !error && (
              <p className="message" role="status">
                Loading crop cards and sensor readings...
              </p>
            )
          ) : crops.length === 0 ? (
            <p className="empty-state">
              No crop cards yet. Add a card for a crop in the sensor feed.
            </p>
          ) : (
            <div className="crop-grid">
              {crops.map((crop) => (
                <DashboardCard
                  crop={crop}
                  key={crop.cropName}
                  onEdit={(selectedCrop) =>
                    setFormCrop({ mode: "edit", crop: selectedCrop })
                  }
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}

          <p className="reading-count" aria-live="polite">
            {lastUpdated
              ? `Updated ${lastUpdated.toLocaleTimeString()}`
              : "Waiting for crop cards and sensor readings"}
            {" · "}
            Moisture status uses each crop's saved target range.
          </p>
        </section>
      </main>
    </div>
  );
}
