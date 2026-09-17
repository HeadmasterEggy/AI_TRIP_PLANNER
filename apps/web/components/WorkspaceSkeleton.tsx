// First paint while the client restores storage or requests the demo plan.
// Mirrors the workspace shell (history, chat, map) to minimise layout shifts.
const HISTORY_WIDTHS = ["82%", "64%", "74%"];

export function WorkspaceSkeleton() {
  return (
    <main className="workspace-shell" aria-busy="true">
      <aside className="workspace-sidebar" aria-hidden="true">
        {HISTORY_WIDTHS.map((width) => (
          <div className="skeleton__section" key={width}>
            <div className="skeleton skeleton--line" style={{ width }} />
            <div className="skeleton skeleton--line" style={{ width: "45%" }} />
          </div>
        ))}
      </aside>
      <section className="workspace-panel workspace-panel--chat">
        <div className="panel chat">
          <h2>Plan together</h2>
          <p className="skeleton__status" role="status">
            Drafting your plan — the agents are negotiating transport, stay, activities and dining.
          </p>
        </div>
      </section>
      <section className="workspace-panel workspace-panel--map" aria-hidden="true">
        <div className="skeleton skeleton--map" />
      </section>
    </main>
  );
}
