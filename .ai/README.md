# Shared project brain

This directory stores the small amount of cross-agent context that should survive a Codex, Claude
Code, Pi, or other AI session. It is versioned project state, not a chat transcript.

## Files

- `PROJECT.md` — product purpose, scope, and stable constraints.
- `CURRENT_STATE.md` — current milestone, recent work, validation, and next handoff.
- `DECISIONS.md` — accepted cross-cutting decisions and their consequences.
- `BACKLOG.md` — a compact index of the active work; detailed implementation plans stay in `docs/`.

## Sources of truth

- Runtime architecture: [`docs/architecture.md`](../docs/architecture.md)
- API contracts: [`docs/api.md`](../docs/api.md)
- Development and directory conventions: [`docs/development.md`](../docs/development.md)
- Product closure work: [`docs/todo-product-closure.md`](../docs/todo-product-closure.md)
- UI visual contract: [`docs/design/ui-guidelines.md`](../docs/design/ui-guidelines.md)
- Historical context: [`docs/session-logs/`](../docs/session-logs/)

Do not create a second copy of a long document in `.ai/`. Put durable decisions and current pointers
here, then link to the detailed document.
