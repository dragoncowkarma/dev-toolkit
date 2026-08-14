# Dynamic Role Assignment Rules

> Part of the [AGENTS.md](../../AGENTS.md) rule system.

## Assignment Algorithm

The orchestrator assigns roles using this priority:

1. **If the Issue body specifies a Worker** → use that AI.
2. **For Reviewer** → pick a DIFFERENT AI from the Worker. Prefer high-reasoning models.
3. **For Maintainer** → pick a DIFFERENT AI from both Worker and Reviewer.

## Role Constraints

| Rule | Description |
|------|-------------|
| Uniqueness | Worker ≠ Reviewer ≠ Maintainer within one Issue→PR cycle |
| Rotation | Prefer rotating AIs across tasks to avoid single-AI dominance |
| Capability matching | Assign complex tasks to high-reasoning models |
| Fail closed | Missing or duplicate role metadata blocks dispatch |
| Event idempotency | One successful AI process per Issue, head SHA, or trigger comment ID |
| Bounded retry | A crashed process is retried up to 3 times for the same event |

## Lifecycle Signals

| Signal | Next role | Idempotency key |
|--------|-----------|-----------------|
| New `[Task]` Issue | Worker | Issue number |
| New PR or Worker revision | Reviewer | PR number + head SHA |
| Tagged Reviewer feedback | Original Worker | PR number + feedback comment ID |
| Tagged Reviewer approval | Maintainer | PR number + approval comment ID |
| Tagged Maintainer block | Reviewer | PR number + block comment ID |

Informational comments do not advance the lifecycle, and an approval is
recognized when a comment carries a Reviewer tag along with either a Maintainer tag
or a dedicated approval tag (e.g. `[Approved]` or `[LGTM]`). Conditional or negative feedback (such as changes required or conditional LGTM) is treated as a revision request. For PRs without an explicit Maintainer tag
(such as issue-less PRs approved by a Reviewer), the Maintainer is automatically selected by the orchestrator using the rotation table.
A Maintainer block requires both its `[Maintainer: ...]` metadata and an
exact `[Maintainer Blocked]` line; it returns the PR to the assigned Reviewer
rather than sending the Worker directly. The Worker and Reviewer can alternate
repeatedly, but only after the other role emits a new signal. Polling and
orchestrator restarts must never repeat an event that is running or already
succeeded.

An event whose process crashed is retried, because abandoning it after one
failure stalls the swarm permanently. Retries stop after 3 failed attempts, and
records left `running` by a crashed orchestrator become retryable once their
PID is confirmed gone.

## Metadata Placement

| Role | Where | Format |
|------|-------|--------|
| Worker | Issue body (or PR body for issue-less PRs) | `[Worker: <ai> \| Model: <model> \| Reasoning: <level>]` |
| Reviewer | PR body | `[Reviewer: <ai> \| Model: <model> \| Reasoning: <level>]` |
| Maintainer | PR review comment (or auto-assigned for issue-less PRs) | `[Maintainer: <ai> \| Model: <model> \| Reasoning: <level>]` |

## Default Reviewer/Maintainer Selection

If the Worker does not specify a Reviewer in the PR, or if an issue-less PR is approved without an explicit Maintainer tag, the orchestrator auto-assigns:

| Worker | Default Reviewer | Default Maintainer |
|--------|-----------------|--------------------|
| codex | antigravity | claude |
| antigravity | claude | codex |
| claude | codex | antigravity |

## Escalation

- If a Reviewer requests changes 3+ times, escalate to a higher-reasoning model.
- If no AI is available, the orchestrator logs a warning and retries after 60 seconds.

## Maintainer as AI3

The Maintainer is the third distinct AI in the lifecycle. After a successful
merge it closes the associated Issue, analyzes the updated project and current
open Issues, and creates exactly one non-duplicate `[Task]` Issue with valid
Worker metadata. It does not implement that follow-up Issue.
