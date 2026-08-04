---
name: my-to-spec
description: Matt's /to-spec, then create the feature branch and record it on the spec issue.
disable-model-invocation: true
---

Run `/to-spec` from `.cursor/skills/matt-pocock/engineering/to-spec/SKILL.md` through issue publish. Follow that process — do not interview.

## 4. Branch

After the spec issue exists, apply [branch-naming.md](../../../../docs/agents/branch-naming.md):

1. `N` = the new spec issue number; title = the spec issue title.
2. Resolve the branch name from `N` and title.
3. `git fetch`. Create the branch from `main` per that doc.
4. Edit the spec issue body: insert `## Branch` with the backtick name before `## Problem Statement`. Save via [issue-tracker.md](../../../../docs/agents/issue-tracker.md).

**Done when:** branch exists locally, spec issue body contains `## Branch`, and `git branch --show-current` matches.
