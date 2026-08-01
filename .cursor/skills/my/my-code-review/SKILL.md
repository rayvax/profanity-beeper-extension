---
name: my-code-review
description: Project code review with mandatory two sub-agents. Use when the user wants /my-code-review or a review that must not skip sub-agents.
disable-model-invocation: true
---

Run `/code-review` from `.cursor/skills/matt-pocock/engineering/code-review/SKILL.md`. Follow that process.

Hard rules:

- NEVER run without subagents.
- ALWAYS run 2 agents. Less is wrong. More is wrong.

Completion: both sub-agent reports aggregated under `## Standards` and `## Spec`.
