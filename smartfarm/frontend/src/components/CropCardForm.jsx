import React from "react";

const emptyProfile = {
  location: "",
  targetMoistureMin: "30",
  targetMoistureMax: "70",
  normalWater: "500",
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
        normalWater: String(crop.normalWater),
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
      normalWater: Number(formData.get("normalWater")),
      notes: formData.get("notes"),
    });
  }

  function validateTargetRange(event) {
    const form = event.currentTarget.form;
    const minimum = Number(form.elements.namedItem("targetMoistureMin").value);
    const maximum = Number(form.elements.namedItem("targetMoistureMax").value);
    const isValid = minimum < maximum;
    form.elements
      .namedItem("targetMoistureMin")
      .setCustomValidity(
        isValid ? "" : "Minimum target must be less than maximum target.",
      );
    form.elements
      .namedItem("targetMoistureMax")
      .setCustomValidity(
        isValid ? "" : "Maximum target must be greater than minimum target.",
      );
  }

  function validateNormalWater(event) {
    const input = event.currentTarget;
    input.setCustomValidity(
      input.value !== "" && Number(input.value) <= 0
        ? "Normal water must be greater than 0 litres."
        : "",
    );
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
        {crop ? (
          <label className="form-field form-field-wide">
            Crop name (cannot be changed)
            <input type="text" value={crop.cropName} disabled />
          </label>
        ) : (
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
            minLength="1"
            maxLength="100"
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
            onChange={validateTargetRange}
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
            onChange={validateTargetRange}
            required
          />
        </label>

        <label className="form-field">
          Normal water (litres)
          <input
            name="normalWater"
            type="number"
            min="0"
            max="10000"
            step="any"
            defaultValue={profile.normalWater}
            onChange={validateNormalWater}
            required
          />
        </label>

        <label className="form-field form-field-wide">
          Notes
          <textarea
            name="notes"
            maxLength="500"
            rows="3"
            defaultValue={profile.notes}
          />
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
