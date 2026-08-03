---
name: my-implement
description: Basically it is Matt's /implement, but with /my-code-review.
disable-model-invocation: true
---

Implement the work described by the user in the spec or tickets.

Use /tdd where possible, at pre-agreed seams.

Run typechecking regularly, single test files regularly, and the full test suite once at the end.

Once done, use /my-code-review to review the work.

Commit your work to the current branch.

When working from a GitHub issue, run `/update-ticket` after commit to sync labels, AC checkboxes, and comments.
