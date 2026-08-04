---
name: my-implement
description: Basically it is Matt's /implement, but with /my-code-review.
disable-model-invocation: true
---

Implement the work described by the user in the spec or tickets.

## 0. Branch

Before any edits, land on the feature branch per [branch-naming.md](../../../../docs/agents/branch-naming.md).

1. Resolve the spec issue — `N` from the ticket's `## Parent`, or the spec the user named. Not the ticket you are implementing.
2. Read `## Branch` on that spec issue; switch there when present.
3. Else derive the name from `N` and the spec title, then switch or create per that doc.
4. `git branch --show-current` must equal the resolved name.

**Done when:** HEAD is on the resolved branch. Stop before any edits if not.

## 1. Build

Use /tdd where possible, at pre-agreed seams.

Run typechecking regularly, single test files regularly, and the full test suite once at the end.

## 2. Review and ship

Once done, use /my-code-review to review the work.

Commit on the branch from step 0 — not `main`, not an ad-hoc name.

When working from a GitHub issue, run `/update-ticket` with outcome **handoff** after commit. Do not close the issue. Human verifies before **pass**.
