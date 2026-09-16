"use client";
export type Navigation = "saved" | "trips" | "language" | "account";
export function Header({ onNavigate }: { onNavigate?: (page: Navigation) => void }) {
  return (
    <header className="header">
      <span className="brand">AI Trip Planner</span>
      <nav aria-label="Workspace navigation">
        <button disabled={!onNavigate} onClick={() => onNavigate?.("saved")}>
          Saved trips
        </button>
        <button disabled={!onNavigate} onClick={() => onNavigate?.("trips")}>
          My trips
        </button>
        <button
          disabled={!onNavigate}
          aria-label="Language: English"
          onClick={() => onNavigate?.("language")}
        >
          EN
        </button>
        <button disabled={!onNavigate} onClick={() => onNavigate?.("account")}>
          Local account
        </button>
      </nav>
    </header>
  );
}
