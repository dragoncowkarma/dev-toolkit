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

## Metadata Placement

| Role | Where | Format |
|------|-------|--------|
| Worker | Issue body | `[Worker: <ai> \| Model: <model> \| Reasoning: <level>]` |
| Reviewer | PR body | `[Reviewer: <ai> \| Model: <model> \| Reasoning: <level>]` |
| Maintainer | PR review comment | `[Maintainer: <ai> \| Model: <model> \| Reasoning: <level>]` |

## Default Reviewer/Maintainer Selection

If the Worker does not specify a Reviewer in the PR, the orchestrator auto-assigns:

| Worker | Default Reviewer | Default Maintainer |
|--------|-----------------|--------------------|
| codex | antigravity | claude |
| antigravity | claude | codex |
| claude | codex | antigravity |

## Escalation

- If a Reviewer requests changes 3+ times, escalate to a higher-reasoning model.
- If no AI is available, the orchestrator logs a warning and retries after 60 seconds.
