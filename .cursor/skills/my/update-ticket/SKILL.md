---
name: update-ticket
description: Sync the GitHub issue frontier after implement handoff, follow-up, or human QA — contract frozen, tail append-only.
argument-hint: "Issue number; outcome (handoff | pass | fix-now | follow-up | scope-change); commit SHA or review gist"
disable-model-invocation: true
---

Sync one GitHub issue after `/my-implement` (**handoff**), human QA (**pass**), `/my-code-review` (human-initiated close), or **follow-up** / **scope-change**.

Three regions:

- **Contract** — frozen body sections: `## What to build`, `## Blocked by`, AC wording, `## Decisions`.
- **Append-only** — session narrative in issue comments; body edits limited to AC checkboxes and `## Remaining work`.
- **Frontier** — triage labels + unchecked AC; what `/my-implement` reads next.

Tracker ops: [issue-tracker.md](../../../../docs/agents/issue-tracker.md). Labels: [triage-labels.md](../../../../docs/agents/triage-labels.md). New-slice shape: [AGENT-BRIEF.md](../../matt-pocock/engineering/triage/AGENT-BRIEF.md).

## 1. Load

```powershell
gh issue view <number> --json number,title,body,labels,state,comments
```

Also when present: parent issue (`## Parent` — task-list row only), `.scratch/<feature>/spec.md`, latest handoff under `.tmp/` (verdict + SHA only).

**Done when:** body, labels, comments, and blockers understood.

## 2. Classify

| Outcome | When |
|---|---|
| **handoff** | `/my-implement` finished — implement + review committed; human must verify before close |
| **pass** | Human confirmed AC (manual QA, loaded extension, etc.) or user explicitly said close the issue |
| **fix-now** | Same session lands fixes — defer sync until re-review |
| **follow-up** | Fresh `/my-implement` needed |
| **scope-change** | Spec intent shifted — not a checkbox tweak |

**Done when:** exactly one outcome chosen. **fix-now** → stop; re-run after commit + review.

Implement sessions → **handoff** or **follow-up**, never **pass**. **pass** requires human verification — not agent review alone.

## 3. Apply

### handoff

In order:

1. Body: do **not** mark AC `[x]` — human verifies AC. Refresh `## Remaining work` with a short QA checklist (numbered, behavioral, ≤5 items). Keep **contract** sections verbatim. Run [HYGIENE.md](HYGIENE.md).
2. Save body via [issue-tracker.md](../../../../docs/agents/issue-tracker.md) temp-file pattern.
3. Remove `ready-for-agent`. Add `ready-for-human`. Remove any other ready-* label.
4. Post one comment:

```markdown
### YYYY-MM-DD — implemented, awaiting human verify
Commit: `<sha>`
Review: <one line per axis if reviewed>
QA: <what human should check — extension load, manual steps, etc.>
```

5. Do **not** `gh issue close`.

**Done when:** issue open, `ready-for-human` set, no `ready-for-agent`, AC unchecked, exactly one handoff comment posted.

### pass

**Precondition:** user explicitly verified (manual QA, etc.) or said "close #N". If only implement + review happened, use **handoff**.

In order:

1. Body: mark met AC `[x]`; collapse empty `## Remaining work`; drop stale checklists duplicating checked AC. Run [HYGIENE.md](HYGIENE.md).
2. Save body via [issue-tracker.md](../../../../docs/agents/issue-tracker.md) temp-file pattern.
3. Remove `ready-for-agent` and `ready-for-human` labels.
4. Post one verdict comment:

```markdown
### YYYY-MM-DD — verified + closed
Commit: `<sha>`
Verdict: <one line per axis if reviewed>
```

5. `gh issue close <number>`.

**Done when:** issue closed, no ready-* labels, every met AC `[x]`, exactly one verdict comment posted.

### follow-up (same issue)

In order:

1. Body: refresh `## Remaining work` — numbered, behavioral, ≤5 items; update AC checkboxes only. Keep **contract** sections verbatim. Run [HYGIENE.md](HYGIENE.md).
2. Save body via issue-tracker temp-file pattern.
3. Set frontier label: `ready-for-agent` (agent work left) or `ready-for-human` (manual QA only); remove the other ready label.
4. Post one comment — what review found, what stays open.

**Done when:** issue open, correct ready label, **contract** untouched, Remaining work current, one comment posted.

### follow-up (new issue)

When remaining work is a **tracer bullet** or outgrew the **contract**:

Present a draft (title, delivers, blocked-by, acceptance criteria). Wait for explicit user approval before `gh issue create` or `/to-tickets`. On decline, use **follow-up (same issue)** or **pass** with deferred Remaining work.

After approval:

1. Finish current issue via **pass** or **follow-up (same issue)** — one terminal state.
2. Publish approved slice via `/to-tickets` (blocking links + `ready-for-agent`).
3. One comment on the original linking `#<new>` — verdict only, no pasted review.

Prefer a new issue over **contract** edits when: architecture split, scope creep, unrelated fixes across review axes.

**Done when:** current issue terminal, new issue published, link comment posted — or user declined and another branch applied.

### scope-change

1. Edit `.scratch/<feature>/spec.md` when present — leave issue **contract** as-is until replacement issues exist.
2. Propose new slices (same draft as **follow-up (new issue)**); wait for approval before publish.
3. After approved replacements exist: `wontfix` label, close, comment pointing to spec and `#<new>` issues.

**Done when:** spec updated, replacements published, affected issue closed with `wontfix`.

## 4. Sync parent

When `## Parent` links a split parent with a child task list, update only that child's checkbox or status cell. Parent stays an index — no review prose. Save via issue-tracker temp-file pattern.

- **handoff** — child row notes verify pending (e.g. status cell `verify`); do not check the child checkbox.
- **pass** — check the child checkbox or mark done.
- **follow-up** — row matches child **frontier** label.

**Done when:** parent row matches child **frontier**, or no parent present.

## 5. Final check

Every **contract** section verbatim. **Frontier** labels and AC checkboxes match verification state (unchecked until human **pass**). Blocking edges correct. One new comment this run (except **fix-now**). No new issue without user approval this session. **handoff** never closes the issue.
