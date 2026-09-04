// Owner: E
export function Header() {
  return (
    <header className="header">
      <span className="brand">AI Trip Planner</span>
      <nav>
        {/* TODO(E): Saved trips / My trips / language / account */}
        <span>Saved trips</span>
        <span>My trips</span>
        <span>EN</span>
      </nav>
    </header>
  );
}
