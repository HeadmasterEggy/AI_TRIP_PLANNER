"use client";
import type { Draft } from "@/lib/workspace";

export function FiltersPanel({
  draft,
  onChange,
  onSubmit,
  busy,
  errors,
}: {
  draft: Draft;
  onChange: (value: Draft) => void;
  onSubmit: () => void;
  busy: boolean;
  errors: Record<string, string>;
}) {
  const field = (key: keyof Draft, label: string, type = "text", errorKey: string = key) => (
    <label className="form-field" key={key}>
      <span>{label}</span>
      <input
        className="field"
        type={type}
        value={String(draft[key])}
        onChange={(e) => onChange({ ...draft, [key]: e.target.value })}
        aria-invalid={!!errors[errorKey]}
        aria-describedby={errors[errorKey] ? `error-${key}` : undefined}
        {...(type === "number"
          ? {
              min: key === "minRating" ? 0 : key === "budgetTotal" ? 0.01 : 1,
              step: key === "groupSize" ? 1 : key === "minRating" ? 0.1 : 0.01,
              max: key === "minRating" ? 10 : undefined,
            }
          : {})}
      />
      {errors[errorKey] && (
        <small className="error-text" id={`error-${key}`}>
          {errors[errorKey]}
        </small>
      )}
    </label>
  );
  return (
    <section className="panel panel--left" aria-labelledby="filters-title">
      <h2 id="filters-title">Trip preferences</h2>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <fieldset disabled={busy} className="plain-fieldset">
          {field("destination", "Destination")}
          <p className="muted">
            Separate multiple cities with &amp;; allow at least one night per city.
          </p>
          {field("start", "Start date", "date", "dates")}
          {field("end", "End date", "date", "dates")}
          {field("groupSize", "Travellers", "number")}
          {field("budgetTotal", "Total budget (USD)", "number")}
          {field("nationality", "Nationality / passport (optional)")}
          <h3>Accommodation</h3>
          <label className="form-field">
            <span>Room allocation</span>
            <select
              className="field"
              value={draft.roomAllocation}
              onChange={(e) =>
                onChange({ ...draft, roomAllocation: e.target.value as Draft["roomAllocation"] })
              }
            >
              <option value="shared">Shared · up to 2 guests per room</option>
              <option value="individual">Individual · 1 room per guest</option>
            </select>
          </label>
          {field("minRating", "Minimum guest rating (out of 10)", "number", "accommodation")}
          <label className="check">
            <input
              type="checkbox"
              checked={draft.freeCancellation}
              onChange={(e) => onChange({ ...draft, freeCancellation: e.target.checked })}
            />
            Free cancellation required
          </label>
          <button className="primary" type="submit">
            {busy ? "Planning…" : "Update trip"}
          </button>
        </fieldset>
      </form>
    </section>
  );
}
