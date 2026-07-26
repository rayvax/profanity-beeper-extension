# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub issues. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body-file <path>`. See [PowerShell: body edits (temp file only)](#powershell-body-edits-temp-file-only) below.
- **Edit an issue body**: `gh issue edit <number> --body-file <path>`. Always verify with `gh issue view <number> --json body` — a bad shell quote can exit 0 without changing the body.
- **Read an issue**: `gh issue view <number> --comments`, filtering comments by `jq` and also fetching labels.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --body-file <path>`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue comment <number> --body-file <path>` then `gh issue close <number>` (or a single close comment via temp file if the body is only the close note)

Infer the repo from `git remote -v` — `gh` does this automatically when run inside a clone.

## PowerShell: body edits (temp file only)

**Agents: use only this approach.** Do not pass multi-line bodies inline (`--body "..."`, PowerShell here-strings, or bash heredocs). Inline quoting is fragile on Windows PowerShell and can exit 0 without updating the issue.

This repo's agent shell is **PowerShell on Windows**. Bash-style heredocs do **not** work here.

**Do not use:**

```powershell
# WRONG — bash heredoc; may exit 0 without updating
gh issue edit 3 --body "$(cat <<'EOF'
## Status
...
EOF
)"

# WRONG — inline here-string; breaks on quotes, backticks, markdown
gh issue edit 3 --body @"
## Status
...
"@
```

**Always use a temp file:**

1. Write body to `.tmp-issue-<number>-body.md` (or `.tmp-issue-comment.md`) with the Write tool.
2. Run `gh` with `--body-file`:

```powershell
gh issue edit 3 --body-file ".tmp-issue-3-body.md"
gh issue create --title "..." --body-file ".tmp-issue-body.md"
gh issue comment 3 --body-file ".tmp-issue-comment.md"
gh pr create --title "..." --body-file ".tmp-pr-body.md"
```

3. Delete the temp file after the command succeeds.
4. Confirm the body landed:

```powershell
gh issue view 3 --json body --jq .body
```

Temp files belong in the repo root (or `.scratch/`). Add `.tmp-*` to `.gitignore` if not already covered. Never commit temp files.

**Tell other agents:** when editing issue/PR bodies in this repo, always write a temp file and pass `--body-file` — no inline `--body`, no here-strings, no heredocs.

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external PRs as feature requests; `/triage` reads this flag.)_

When set to `yes`, PRs run through the same labels and states as issues, using the `gh pr` equivalents:

- **Read a PR**: `gh pr view <number> --comments` and `gh pr diff <number>` for the diff.
- **List external PRs for triage**: `gh pr list --state open --json number,title,body,labels,author,authorAssociation,comments` then keep only `authorAssociation` of `CONTRIBUTOR`, `FIRST_TIME_CONTRIBUTOR`, or `NONE` (drop `OWNER`/`MEMBER`/`COLLABORATOR`).
- **Comment / label / close**: `gh pr comment`, `gh pr edit --add-label`/`--remove-label`, `gh pr close`.

GitHub shares one number space across issues and PRs, so a bare `#42` may be either — resolve with `gh pr view 42` and fall back to `gh issue view 42`.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single issue with **child** issues as tickets.

- **Map**: a single issue labelled `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body. `gh issue create --label wayfinder:map`.
- **Child ticket**: an issue linked to the map as a GitHub sub-issue (`gh api` on the sub-issues endpoint). Where sub-issues aren't enabled, add the child to a task list in the map body and put `Part of #<map>` at the top of the child body. Labels: `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`). Once claimed, the ticket is assigned to the driving dev.
- **Blocking**: GitHub's **native issue dependencies** — the canonical, UI-visible representation. Add an edge with `gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`, where `<blocker-db-id>` is the blocker's numeric **database id** (`gh api repos/<owner>/<repo>/issues/<n> --jq .id`, _not_ the `#number` or `node_id`). GitHub reports `issue_dependencies_summary.blocked_by` (open blockers only — the live gate). Where dependencies aren't available, fall back to a `Blocked by: #<n>, #<n>` line at the top of the child body. A ticket is unblocked when every blocker is closed.
- **Frontier query**: list the map's open children (`gh issue list --state open`, scoped to the map's sub-issues / task list), drop any with an open blocker (`issue_dependencies_summary.blocked_by > 0`, or an open issue in the `Blocked by` line) or an assignee; first in map order wins.
- **Claim**: `gh issue edit <n> --add-assignee @me` — the session's first write.
- **Resolve**: `gh issue comment <n> --body-file <path>`, then `gh issue close <n>`, then append a context pointer (gist + link) to the map's Decisions-so-far.
