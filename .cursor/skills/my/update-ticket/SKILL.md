---
name: update-ticket
description: Sync a GitHub issue after /my-implement, /my-code-review, or manual QA — frozen contract, append-only comments, label frontier.
argument-hint: "Issue number; outcome (pass | fix-now | follow-up | scope-change); commit SHA or review gist"
disable-model-invocation: true
---

Update one GitHub issue after `/my-implement`, `/my-code-review`, or manual QA — without turning the issue into a second handoff.

**Contract** (frozen in the issue body): `## What to build`, `## Blocked by`, original acceptance-criteria wording, any `## Decisions` tables.

**Append-only** tail: GitHub issue **comments** for session narrative; body may update AC checkbox state and `## Remaining work` only.

**Frontier**: triage **labels** + unchecked AC in the body are what the next `/my-implement` reads. Handoffs hold session narrative; the issue holds grab state.

Read before editing: [issue-tracker.md](../../../../docs/agents/issue-tracker.md), [triage-labels.md](../../../../docs/agents/triage-labels.md). Follow-up brief shape: [AGENT-BRIEF.md](../../matt-pocock/engineering/triage/AGENT-BRIEF.md).

**All body edits:** write `.tmp-issue-<number>-body.md`, run `gh issue edit <number> --body-file`, verify with `gh issue view <number> --json body`, delete temp file. **All comments:** `.tmp-issue-<number>-comment.md` + `gh issue comment`. Never inline `--body` on PowerShell.

**Completion criterion:** issue read via `gh`; outcome classified; contract sections untouched; every AC checkbox matches reality; triage labels match outcome; blocking edges still correct; no review transcript in the body; parent task-list row synced when present; one new issue comment with date, commit SHA (if any), and ≤5 open bullets when work remains. **No new issue** unless the user explicitly approved the draft in this session.

## 1. Load context

Read the issue the user named (`#<number>`, bare number, or GitHub URL).

```powershell
gh issue view <number> --json number,title,body,labels,state,comments
```

Also read when present:

- **Parent issue** linked from `## Parent` — task-list row only
- **Spec** at `.scratch/<feature>/spec.md` when the feature has local spec — scope truth
- Latest handoff under `.tmp/` — **do not copy** into the issue; extract verdict + SHA only

## 2. Classify outcome

| Outcome | When |
|---|---|
| **pass** | All AC met; review axes clean or only non-blocking notes |
| **fix-now** | Same session will land fixes — defer issue edit until re-review passes |
| **follow-up** | More work needs a fresh `/my-implement` |
| **scope-change** | Spec intent shifted — not a checkbox tweak |

## 3. Apply the pattern

### pass

1. Check every met AC `[x]` in the body; leave unmet `[ ]` only if intentionally deferred to another issue.
2. Remove `ready-for-agent` / `ready-for-human` labels. Close: `gh issue close <number>`.
3. Post a comment:

```markdown
### YYYY-MM-DD — implemented + reviewed
Commit: `<sha>`
Verdict: <one line per axis if reviewed>
```

4. Remove or collapse **Remaining work** in the body if empty. Delete stale checklists that duplicate checked AC.

### follow-up (same issue)

1. **Do not** rewrite contract or AC wording.
2. Add or refresh `## Remaining work` in the body — numbered, behavioral, ≤5 items (no file paths).
3. Open vs done **only** by checkbox state — not duplicate sections.
4. Labels: `ready-for-agent` (agent work left) or `ready-for-human` (manual QA only). Remove the other ready label.
5. Post one comment: what review found, what is still open.

### follow-up (new issue)

When remaining work is a **tracer bullet** (vertical slice) or outgrew the original contract:

**Stop — user approval required before any new issue exists.** Present a draft (title, what it delivers, blocked-by, acceptance criteria) and wait for explicit approval. No `gh issue create`, no `/to-tickets` publish, until the user says yes. If they decline, stay on **follow-up (same issue)** or **pass** with deferred items in Remaining work.

After approval only:

1. Close or leave open the current issue per **pass** or **follow-up (same issue)** — never both half-done.
2. Publish the approved issue via `/to-tickets` shape (native blocking links or `## Blocked by` lines, `ready-for-agent` label).
3. On the original issue, one comment linking `#<new>` — no pasted review.

Use a new issue — not contract edits — when: architecture split, scope creep, or review axes disagree on unrelated fixes.

### scope-change

1. Edit `.scratch/<feature>/spec.md` when one exists — not the issue contract.
2. Propose new slices (same draft shape as **follow-up (new issue)**). **User approval required** before publishing any new issue.
3. On the affected issue: `wontfix` label, close, comment pointing to spec and replacement issues — only after approved issues exist.

### fix-now

Skip issue edit. Re-run after commit + review → **pass** or **follow-up**.

## 4. Sync parent index

When `## Parent` references a split parent issue with a child task list, update **only** that child's checkbox or status cell in the parent body. Parent stays an index — no review prose. Edit parent body via the same temp-file pattern.

## 5. Hygiene checks

Before saving, reject these in the issue body:

| Reject | Put it instead |
|---|---|
| Full review transcript | Handoff or one-line verdict in a comment |
| `<details>` review archives | Handoff; keep ≤5 bullets in Remaining work |
| File paths / line numbers in contract | Handoff or spec |
| Custom status prose (`qa-pending`, `implemented`) | Triage labels from [triage-labels.md](../../../../docs/agents/triage-labels.md) |
| `Blocked by` wrong vs actual merge order | Fix dependency edges or comment "implemented out of order; QA on …" |
| Truth only in handoff/parent, not issue | Labels + AC checkboxes must match code |

**Do not** run `/triage` on issues `/to-tickets` created — they are already agent-ready.
