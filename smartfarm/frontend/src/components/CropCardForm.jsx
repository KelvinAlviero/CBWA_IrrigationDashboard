import React from "react";

const emptyProfile = {
  location: "",
  targetMoistureMin: "30",
  targetMoistureMax: "70",
  normalWaterAmount: "1",
  normalWaterUnit: "L/plant/day",
  notes: "",
};

export default function CropCardForm({
  crop,
  cropOptions,
  cropName,
  onCropNameChange,
  onCancel,
  onSubmit,
  isSaving,
}) {
  const profile = crop
    ? {
        location: crop.location,
        targetMoistureMin: String(crop.targetMoistureMin),
        targetMoistureMax: String(crop.targetMoistureMax),
        normalWaterAmount: String(crop.normalWaterAmount),
        normalWaterUnit: crop.normalWaterUnit,
        notes: crop.notes,
      }
    : emptyProfile;

  function handleSubmit(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    onSubmit({
      cropName: crop?.cropName ?? cropName,
      location: formData.get("location"),
      targetMoistureMin: Number(formData.get("targetMoistureMin")),
      targetMoistureMax: Number(formData.get("targetMoistureMax")),
      normalWaterAmount: Number(formData.get("normalWaterAmount")),
      normalWaterUnit: formData.get("normalWaterUnit"),
      notes: formData.get("notes"),
    });
  }

  return (
    <section
      className="crop-form-panel"
      aria-labelledby="crop-form-title"
      aria-busy={isSaving}
    >
      <div className="crop-form-heading">
        <div>
          <p className="eyebrow">{crop ? "UPDATE PROFILE" : "NEW PROFILE"}</p>
          <h2 id="crop-form-title">
            {crop ? `Edit ${crop.cropName}` : "Add crop card"}
          </h2>
        </div>
      </div>

      <form className="crop-form" onSubmit={handleSubmit}>
        {!crop && (
          <label className="form-field form-field-wide">
            Crop name
            <select
              name="cropName"
              value={cropName}
              onChange={(event) => onCropNameChange(event.target.value)}
              required
            >
              <option value="" disabled>
                Select a crop from the sensor feed
              </option>
              {cropOptions.map((option) => (
                <option value={option} key={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="form-field">
          Location
          <input
            name="location"
            type="text"
            maxLength="120"
            defaultValue={profile.location}
            required
          />
        </label>

        <label className="form-field">
          Minimum target moisture (%)
          <input
            name="targetMoistureMin"
            type="number"
            min="0"
            max="100"
            step="any"
            defaultValue={profile.targetMoistureMin}
            required
          />
        </label>

        <label className="form-field">
          Maximum target moisture (%)
          <input
            name="targetMoistureMax"
            type="number"
            min="0"
            max="100"
            step="any"
            defaultValue={profile.targetMoistureMax}
            required
          />
        </label>

        <label className="form-field">
          Normal water amount
          <input
            name="normalWaterAmount"
            type="number"
            min="0"
            step="any"
            defaultValue={profile.normalWaterAmount}
            required
          />
        </label>

        <label className="form-field">
          Water unit
          <input
            name="normalWaterUnit"
            type="text"
            maxLength="40"
            defaultValue={profile.normalWaterUnit}
            required
          />
        </label>

        <label className="form-field form-field-wide">
          Notes
          <textarea name="notes" maxLength="2000" rows="3" defaultValue={profile.notes} />
        </label>

        <div className="form-actions form-field-wide">
          <button
            className="secondary-button"
            type="button"
            onClick={onCancel}
            disabled={isSaving}
          >
            Cancel
          </button>
          <button className="primary-button" type="submit" disabled={isSaving}>
            {isSaving ? "Saving..." : crop ? "Save changes" : "Create crop card"}
          </button>
        </div>
      </form>
    </section>
  );
}
