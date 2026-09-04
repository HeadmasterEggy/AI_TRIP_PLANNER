// Owner: E — left rail. Static for now.
// TODO(E): make these controlled inputs and persist to PreferenceMemoryService
//          (long-term memory). See @trip/services `memory.setLongTerm`.
import type { TripBrief } from "@trip/shared";

export function FiltersPanel({ brief }: { brief: TripBrief }) {
  return (
    <section className="panel panel--left">
      <h2>Filters</h2>

      <h3>Destination</h3>
      <input className="field" defaultValue={brief.destination} placeholder="Search destinations" />

      <h3>Dates</h3>
      <input className="field" defaultValue={`${brief.dates[0]} – ${brief.dates[1]}`} />

      <h3>Travellers</h3>
      <input className="field" defaultValue={`${brief.groupSize} adults`} />

      <h3>Budget (total)</h3>
      <input className="field" defaultValue={`$${brief.budgetTotal}`} />

      <h3>Interests</h3>
      {["culture", "adventure", "food", "nature", "family", "nightlife"].map((tag) => (
        <label key={tag} className="check">
          <input type="checkbox" defaultChecked={brief.interests.includes(tag)} /> {tag}
        </label>
      ))}

      <div className="todo">TODO(E): accommodation type, star rating, amenities, “show more”.</div>
    </section>
  );
}
