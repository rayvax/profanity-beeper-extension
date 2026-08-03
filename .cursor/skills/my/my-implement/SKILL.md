---
name: my-implement
description: Basically it is Matt's /implement, but with /my-code-review.
disable-model-invocation: true
---

Implement the work described by the user in the spec or tickets.

## 0. Branch

All work and commits for this session land on `[type]/[N]_[description]`.

**`N` is the parent spec issue id** — the `#` from `## Parent` on the ticket, or the spec the user named. Not the ticket id you are implementing.

1. Resolve `N` from the ticket's `## Parent` or the user's spec reference.
2. Derive `type` and `description` from the **spec** title: use a leading `feat`/`fix`/`chore`/`refactor` when present, otherwise `feat`; `description` is a kebab-slug of the spec title (lowercase, hyphens, strip `#` and punctuation).
3. `git fetch`. Branch exists → `git switch [type]/[N]_[description]`; else `git switch -c [type]/[N]_[description]` from `main`.
4. `git branch --show-current` must equal `[type]/[N]_[description]`.

**Done when:** HEAD is on `[type]/[N]_[description]`. Stop before any edits if not.

## 1. Build

Use /tdd where possible, at pre-agreed seams.

Run typechecking regularly, single test files regularly, and the full test suite once at the end.

## 2. Review and ship

Once done, use /my-code-review to review the work.

Commit to `[type]/[N]_[description]` from step 0 — not `main`, not an ad-hoc branch name.

When working from a GitHub issue, run `/update-ticket` with outcome **handoff** after commit. Do not close the issue. Human verifies before **pass**.
