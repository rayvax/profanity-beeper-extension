# Hygiene

Run before every body save.

| Keep out of the body | Put it here instead |
|---|---|
| Review transcript | Handoff, or one-line verdict in a comment |
| `<details>` review archives | Handoff; ≤5 bullets in `## Remaining work` |
| File paths / line numbers in the **contract** | Handoff or spec |
| Custom status prose (`qa-pending`, `implemented`) | Triage labels — [triage-labels.md](../../../../docs/agents/triage-labels.md) |
| Wrong `Blocked by` vs merge order | Fix dependency edges, or comment "implemented out of order; QA on …" |
| Truth only in handoff or parent | After **handoff**: `ready-for-human` + unchecked AC. After human **pass**: AC `[x]` + issue closed |

Issues `/to-tickets` published are already agent-ready — skip `/triage`.
