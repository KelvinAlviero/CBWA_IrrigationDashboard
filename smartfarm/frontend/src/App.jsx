import React, { useCallback, useEffect, useMemo, useState } from "react";
import CropCardForm from "./components/CropCardForm.jsx";
import DashboardCard from "./components/DashboardCard.jsx";
import {
  createCropCard,
  deleteCropCard,
  getCropCards,
  getReadings,
  updateCropCard,
} from "./services/api.js";
import {
  analyseCropCards,
  calculateFarmStatus,
  createUnavailableCropCards,
  getAvailableCropNames,
} from "./utils/analysis.js";

export default function App() {
  const [cropProfiles, setCropProfiles] = useState(null);
  const [sensorReadings, setSensorReadings] = useState(null);
  const [hasAttemptedSensorRequest, setHasAttemptedSensorRequest] =
    useState(false);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [cropError, setCropError] = useState("");
  const [sensorError, setSensorError] = useState("");
  const [actionError, setActionError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isLoadingCrops, setIsLoadingCrops] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formCrop, setFormCrop] = useState(null);
  const [newCropName, setNewCropName] = useState("");
  const [historyCropName, setHistoryCropName] = useState(null);

  const loadCropCards = useCallback(async () => {
    setIsLoadingCrops(true);
    setCropError("");
    try {
      const crops = await getCropCards();
      setCropProfiles(crops);
      return true;
    } catch (error) {
      setCropError(`Could not load crop cards: ${error.message}`);
      return false;
    } finally {
      setIsLoadingCrops(false);
    }
  }, []);

  const refreshSensorData = useCallback(async ({ initial = false } = {}) => {
    setIsRefreshing(true);
    setSensorError("");
    try {
      const readings = await getReadings();
      setSensorReadings(readings);
      setHasAttemptedSensorRequest(true);
      setLastRefresh(new Date());
      return true;
    } catch (error) {
      setHasAttemptedSensorRequest(true);
      setSensorError(
        `${initial ? "Could not load" : "Could not refresh"} sensor data: ${error.message}`,
      );
      return false;
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    async function loadInitialData() {
      setIsLoadingCrops(true);
      setIsRefreshing(true);
      setCropError("");
      setSensorError("");
      void getCropCards()
        .then((crops) => {
          if (isMounted) {
            setCropProfiles(crops);
            setCropError("");
          }
        })
        .catch((error) => {
          if (isMounted) {
            setCropError(`Could not load crop cards: ${error.message}`);
          }
        })
        .finally(() => {
          if (isMounted) setIsLoadingCrops(false);
        });
      void getReadings()
        .then((readings) => {
          if (isMounted) {
            setSensorReadings(readings);
            setHasAttemptedSensorRequest(true);
            setLastRefresh(new Date());
            setSensorError("");
          }
        })
        .catch((error) => {
          if (isMounted) {
            setHasAttemptedSensorRequest(true);
            setSensorError(`Could not load sensor data: ${error.message}`);
          }
        })
        .finally(() => {
          if (isMounted) setIsRefreshing(false);
        });
    }

    void loadInitialData();
    return () => {
      isMounted = false;
    };
  }, []);

  const results = useMemo(() => {
    if (cropProfiles === null || !hasAttemptedSensorRequest) return null;
    return sensorReadings === null
      ? createUnavailableCropCards(cropProfiles)
      : analyseCropCards(cropProfiles, sensorReadings);
  }, [cropProfiles, sensorReadings, hasAttemptedSensorRequest]);
  const farmStatus =
    results === null
      ? null
      : calculateFarmStatus(results, sensorReadings !== null);
  const availableCropNames =
    cropProfiles === null ||
    sensorReadings === null ||
    !hasAttemptedSensorRequest
      ? []
      : getAvailableCropNames(sensorReadings, cropProfiles);

  function openAddForm() {
    if (cropProfiles === null || sensorReadings === null) return;
    setActionError("");
    setSuccessMessage("");
    setNewCropName(availableCropNames[0] ?? "");
    setFormCrop({ mode: "add" });
  }

  async function handleSave(profile) {
    setIsSaving(true);
    setActionError("");
    setSuccessMessage("");
    try {
      const savedCrop =
        formCrop?.mode === "edit"
          ? await updateCropCard(formCrop.crop.id, profile)
          : await createCropCard(profile.cropName, profile);
      setCropProfiles((current) => {
        if (formCrop?.mode === "edit") {
          return current.map((crop) =>
            crop.cropName === savedCrop.cropName ? savedCrop : crop,
          );
        }
        return [...current, savedCrop].sort((a, b) =>
          a.cropName.localeCompare(b.cropName),
        );
      });
      setFormCrop(null);
      setSuccessMessage(
        formCrop?.mode === "edit"
          ? "Crop Card updated successfully."
          : "Crop Card created successfully.",
      );
    } catch (error) {
      setActionError(`Could not save crop card: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(cropId) {
    setActionError("");
    setSuccessMessage("");
    try {
      await deleteCropCard(cropId);
      const deletedCropName = cropProfiles.find(
        (crop) => crop.id === cropId,
      )?.cropName;
      setCropProfiles((current) =>
        current.filter((crop) => crop.id !== cropId),
      );
      if (formCrop?.mode === "edit" && formCrop.crop.id === cropId) {
        setFormCrop(null);
      }
      if (historyCropName === deletedCropName) setHistoryCropName(null);
      setSuccessMessage("Crop Card deleted successfully.");
    } catch (error) {
      setActionError(`Could not delete crop card: ${error.message}`);
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
              <h1 id="dashboard-title">SmartFarm Crop Dashboard</h1>
              <p className="panel-description">
                Manage crop profiles and view their latest sensor readings.
              </p>
              {cropProfiles !== null && (
                <p className="panel-description crop-count">
                  Crop Cards: {cropProfiles.length}
                </p>
              )}
            </div>
            <div className="panel-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={openAddForm}
                disabled={
                  cropProfiles === null ||
                  sensorReadings === null ||
                  !hasAttemptedSensorRequest ||
                  isSaving ||
                  isRefreshing ||
                  availableCropNames.length === 0
                }
              >
                Add Crop Card
              </button>
              <button
                className="refresh-button"
                type="button"
                onClick={() => void refreshSensorData()}
                disabled={isRefreshing || isSaving || cropProfiles === null}
              >
                <span aria-hidden="true">{isRefreshing ? "↻" : "⟳"}</span>
                {isRefreshing ? "Refreshing..." : "Refresh Sensor Data"}
              </button>
            </div>
          </div>

          {farmStatus && (
            <div className="farm-status" aria-live="polite">
              <span>Overall Farm Status</span>
              <strong
                className={`status-badge farm-status-${farmStatus
                  .toLowerCase()
                  .replaceAll(" ", "-")}`}
              >
                {farmStatus}
              </strong>
            </div>
          )}

          {(cropError || sensorError || actionError) && (
            <div className="message error-message" role="alert">
              <p>{[cropError, sensorError, actionError].filter(Boolean).join(" ")}</p>
              {cropError && cropProfiles === null && (
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => void loadCropCards()}
                  disabled={isLoadingCrops}
                >
                  {isLoadingCrops ? "Retrying..." : "Retry"}
                </button>
              )}
            </div>
          )}

          {successMessage && (
            <p className="message success-message" role="status">
              {successMessage}
            </p>
          )}

          {formCrop && cropProfiles !== null && sensorReadings !== null && (
            <CropCardForm
              key={
                formCrop.mode === "edit"
                  ? `edit-${formCrop.crop.cropName}`
                  : "add-crop"
              }
              crop={formCrop.mode === "edit" ? formCrop.crop : null}
              cropOptions={availableCropNames}
              cropName={newCropName}
              onCropNameChange={setNewCropName}
              onCancel={() => setFormCrop(null)}
              onSubmit={handleSave}
              isSaving={isSaving}
            />
          )}

          {cropProfiles === null ? (
            <p className="message" role="status">
              {isLoadingCrops
                ? "Loading crop cards and sensor readings..."
                : cropError
                  ? "Crop cards are unavailable until loading succeeds."
                  : "Loading crop cards..."}
            </p>
          ) : results === null ? (
            <p className="message" role="status">
              Loading sensor readings...
            </p>
          ) : results.length === 0 ? (
            <p className="empty-state">
              No crop cards yet. Add a card for a crop in the sensor feed.
            </p>
          ) : (
            <div className="crop-grid">
              {results.map((result) => {
                const cropProfile = cropProfiles.find(
                  (crop) => crop.cropName === result.crop.crop_name,
                );
                return (
                  <DashboardCard
                    crop={result}
                    key={result.crop.id}
                    onEdit={() =>
                      setFormCrop({ mode: "edit", crop: cropProfile })
                    }
                    onDelete={() => void handleDelete(result.crop.id)}
                    onToggleHistory={() =>
                      setHistoryCropName((current) =>
                        current === result.crop.crop_name
                          ? null
                          : result.crop.crop_name,
                      )
                    }
                    isHistoryOpen={historyCropName === result.crop.crop_name}
                    readings={
                      sensorReadings?.filter(
                        (reading) =>
                          reading.crop_name === result.crop.crop_name,
                      ) ?? []
                    }
                  />
                );
              })}
            </div>
          )}

          <p className="reading-count" aria-live="polite">
            Last refresh:{" "}
            {lastRefresh ? lastRefresh.toLocaleTimeString() : "Never"}
          </p>
        </section>
      </main>
    </div>
  );
}
