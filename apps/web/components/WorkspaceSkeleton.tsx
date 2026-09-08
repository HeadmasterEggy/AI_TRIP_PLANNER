// Owner: E — first paint while the orchestrator runs. Mirrors the Workspace
// grid so the real panels stream in without the layout shifting.
const SECTION_WIDTHS = ["82%", "64%", "74%", "58%", "70%"];

export function WorkspaceSkeleton() {
  return (
    <main className="layout" aria-busy="true">
      <section className="panel panel--left">
        <h2>Filters</h2>
        <div className="skeleton skeleton--line" style={{ width: "40%" }} />
        <div className="skeleton skeleton--field" />
        <div className="skeleton skeleton--line" style={{ width: "30%" }} />
        <div className="skeleton skeleton--field" />
        <div className="skeleton skeleton--line" style={{ width: "45%" }} />
        <div className="skeleton skeleton--field" />
      </section>

      <section className="panel chat">
        <h2>AI Trip Planner · Agent</h2>
        <p className="skeleton__status" role="status">
          Drafting your plan — the agents are negotiating transport, stay, activities and dining.
        </p>
      </section>

      <section className="panel panel--right">
        <h2>Your trip</h2>
        <div className="skeleton skeleton--line" style={{ width: "60%" }} />
        <div className="skeleton skeleton--bar" />
        {SECTION_WIDTHS.map((width) => (
          <div className="skeleton__section" key={width}>
            <div className="skeleton skeleton--line" style={{ width: "35%" }} />
            <div className="skeleton skeleton--line" style={{ width }} />
          </div>
        ))}
      </section>
    </main>
  );
}
