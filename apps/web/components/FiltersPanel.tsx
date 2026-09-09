// Left rail. These fields mirror the TripBrief the agents plan against.
//
// TODO(E): make these editable and persist to PreferenceMemoryService
//          (long-term memory). See @trip/services `memory.setLongTerm`.
//          Until then they are read-only: nothing here is wired to a handler,
//          and an uncontrolled input that accepts typing would both discard
//          the edit and stop tracking the brief, because a dirtied input no
//          longer follows its value attribute. The trip is changed through
//          chat, so the rail has to keep showing what the plan actually used.
import type { TripBrief } from "@trip/shared";

export function FiltersPanel({ brief }: { brief: TripBrief }) {
  return (
    <section className="panel panel--left">
      <h2>Filters</h2>

      <h3 id="filter-destination">Destination</h3>
      <input
        className="field"
        readOnly
        aria-labelledby="filter-destination"
        value={brief.destination}
      />

      <h3 id="filter-dates">Dates</h3>
      <input
        className="field"
        readOnly
        aria-labelledby="filter-dates"
        value={`${brief.dates[0]} – ${brief.dates[1]}`}
      />

      <h3 id="filter-travellers">Travellers</h3>
      <input
        className="field"
        readOnly
        aria-labelledby="filter-travellers"
        value={`${brief.groupSize} ${brief.groupSize === 1 ? "adult" : "adults"}`}
      />

      <h3 id="filter-budget">Budget (total)</h3>
      <input
        className="field"
        readOnly
        aria-labelledby="filter-budget"
        value={`$${brief.budgetTotal.toLocaleString()}`}
      />

      <div className="todo">
        TODO(E): trip style (J/P), nationality, accommodation type, star rating,
        amenities, “show more”. All feed the TripBrief.
      </div>
    </section>
  );
}
