# Branch naming

Feature work for a spec shares one git branch. Child tickets under that spec land on the same branch — `N` is always the **spec issue id**, not a tracer-bullet ticket id.

## Pattern

```
[type]/[N]_[description]
```

| Part | Rule |
| --- | --- |
| `type` | Leading `feat`, `fix`, `chore`, or `refactor` from the spec title when present; otherwise `feat` |
| `N` | Spec issue number (`#` from GitHub) |
| `description` | Kebab-slug from the spec title: lowercase, hyphens between words, strip `#`, punctuation, and the type prefix. **Max 20 characters** — truncate if longer. Does not need to match the full title slug. |

**Examples**

| Spec title | Branch |
| --- | --- |
| `feat: Match config resolver` | `feat/42_match-config-resolve` |
| `Fix caption chunk race` | `fix/17_caption-chunk-race` |
| `Chore: dependency bump` | `chore/8_dependency-bump` |

## Resolve

Inputs: spec issue number `N`, spec issue title.

1. Apply the table above to produce the branch name.
2. If the spec issue body has `## Branch`, use the backtick name there — do not re-derive.

## Switch or create

From repo root, after `git fetch`:

- Branch exists → `git switch [type]/[N]_[description]`
- Else → `git switch -c [type]/[N]_[description]` from `main`

Verify: `git branch --show-current` equals the resolved name.

## Record on the spec issue

When creating the branch (at spec publish), add to the spec issue body:

```markdown
## Branch

`feat/42_match-config-resolve`
```

Save via the temp-file pattern in [issue-tracker.md](./issue-tracker.md). This section is the canonical record — `/my-implement` reads it before deriving.

Place `## Branch` after the title block and before `## Problem Statement` when publishing a new spec.
