"use client";

export type HistoryItem = {
  id: string;
  title: string;
  subtitle: string;
  updatedAt: string;
  status?: "Draft" | "Needs review" | "Confirmed";
  active?: boolean;
};

export function WorkspaceSidebar({
  query,
  onQuery,
  chats,
  trips,
  onNewChat,
  onOpenChat,
  onOpenTrip,
  onRenameChat,
  onDeleteChat,
  saveState,
}: {
  query: string;
  onQuery(value: string): void;
  chats: HistoryItem[];
  trips: HistoryItem[];
  onNewChat(): void;
  onOpenChat(id: string): void;
  onOpenTrip(id: string): void;
  onRenameChat(id: string): void;
  onDeleteChat(id: string): void;
  saveState: "saving" | "saved" | "failed";
}) {
  const list = (items: HistoryItem[], onOpen: (id: string) => void, chatsList = false) => (
    <div className="history-list">
      {items.map((item) => (
        <article
          className={`history-item${item.active ? " history-item--active" : ""}`}
          key={item.id}
        >
          <button className="history-item__open" onClick={() => onOpen(item.id)}>
            <strong>{item.title}</strong>
            <span>{item.subtitle}</span>
            <small>
              {item.status ? `${item.status} · ` : ""}
              {new Date(item.updatedAt).toLocaleString()}
            </small>
          </button>
          {chatsList && (
            <div className="history-item__actions">
              <button aria-label={`Rename ${item.title}`} onClick={() => onRenameChat(item.id)}>
                Rename
              </button>
              <button aria-label={`Delete ${item.title}`} onClick={() => onDeleteChat(item.id)}>
                Delete
              </button>
            </div>
          )}
        </article>
      ))}
      {!items.length && <p className="history-empty">No matching records.</p>}
    </div>
  );

  return (
    <aside className="workspace-sidebar" aria-label="Chats and trips">
      <div className="workspace-sidebar__head">
        <strong>Workspace</strong>
        <span className={`save-state save-state--${saveState}`} role="status">
          {saveState === "saving"
            ? "Saving…"
            : saveState === "failed"
              ? "Save failed"
              : "Saved locally"}
        </span>
      </div>
      <button className="primary workspace-sidebar__new" onClick={onNewChat}>
        + New chat
      </button>
      <label className="workspace-sidebar__search">
        <span className="sr-only">Search chats and trips</span>
        <input
          className="field"
          type="search"
          placeholder="Search chats and trips"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
        />
      </label>
      <details open>
        <summary>
          Chats <span>{chats.length}</span>
        </summary>
        {list(chats, onOpenChat, true)}
      </details>
      <details open>
        <summary>
          Trips <span>{trips.length}</span>
        </summary>
        {list(trips, onOpenTrip)}
      </details>
    </aside>
  );
}
