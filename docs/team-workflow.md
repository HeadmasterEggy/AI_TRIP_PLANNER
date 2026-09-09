# Team and Git workflow

This is a single deployable, so ownership is by module rather than by frontend/backend layers.

| Area | Ownership |
| --- | --- |
| Orchestrator and integration | Graph state, supervisor, contracts, conflict policy, HITL and CI |
| Itinerary and transport | Schedule, route feasibility and maps adapter |
| Accommodation and budget | Lodging adapter, cost aggregation and budget policy |
| Destination and dining | Grounded guide, customs, dining and dietary constraints |
| Web and memory | Chat, filters, plan UI, preference memory and persistence |

## Branches and commits

Use `feature/<module>-<short-desc>` or `codex/<short-desc>` for agent work. Use conventional
prefixes: `feat:`, `fix:`, `docs:`, `refactor:`, `test:` and `chore:`.

Open a pull request for `main`. CI must pass and at least one other person should review the change.
Do not force-push or delete `main`.

Every AI-assisted coding session should add a concise note using
`docs/session-logs/TEMPLATE.md`.
