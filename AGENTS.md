# AGENTS.md — Vendor-Agnostic Autonomous Multi-Agent Swarm Rules

> **Single Source of Truth**: This document and the `.agents/rules/` directory are the ONLY authoritative source for all AI agent rules, skills, and workflows in this project. All AI-specific config files (CLAUDE.md, .antigravity/rules/main.md, .cursorrules, etc.) MUST point here.

---

## 1. Architecture Overview

This project uses a **vendor-agnostic autonomous multi-agent swarm** where multiple AI systems (Codex, Antigravity, Claude, etc.) collaborate through GitHub Issues, PRs, and comments as their sole communication medium.

### Principles
- **No vendor lock-in**: Rules are written once in this file, all AI tools follow them.
- **GitHub as the communication bus**: All AI-to-AI communication happens via Issues, PRs, and comments.
- **Worktree isolation**: Every task runs in an isolated `git worktree` — never switch branches on main.
- **Dynamic role assignment**: Worker, Reviewer, and Maintainer are always different AIs.
- **Autonomous evolution**: AIs can create Issues, modify rules, and improve the system.

---

## 2. Role Definitions

### 2.1 Worker
- **Responsibility**: Implements the feature/fix described in the Issue (or PR for issue-less PRs).
- **Metadata location**: Issue body (or PR body for issue-less PRs).
- **Format**: `[Worker: <ai_name> | Model: <model> | Reasoning: <level>]`
- **Process**: Reads the Issue → creates a branch → implements in a worktree → opens a PR.

### 2.2 Reviewer
- **Responsibility**: Reviews the PR for correctness, style, and adherence to project rules.
- **Metadata location**: PR body.
- **Format**: `[Reviewer: <ai_name> | Model: <model> | Reasoning: <level>]`
- **Process**: Reads the PR diff → leaves review comments → approves or requests changes.

### 2.3 Maintainer
- **Responsibility**: Final approval, merge, cleanup, post-merge project analysis,
  and creation of exactly one non-duplicate follow-up Issue.
- **Metadata location**: PR review completion comment (or auto-selected by orchestrator for issue-less PRs lacking a Maintainer tag).
- **Format**: `[Maintainer: <ai_name> | Model: <model> | Reasoning: <level>]`
- **Process**: Verifies CI passes → confirms review → merges PR → closes the
  associated Issue → analyzes the updated project → creates the next Issue.

### 2.4 Constraint
> Within a single Issue→PR lifecycle, the Worker, Reviewer, and Maintainer MUST be **three different AIs**.

### 2.5 Dispatch Idempotency
- A lifecycle event MUST dispatch its assigned AI at most once successfully.
- Event identity is based on the Issue, PR head SHA, or triggering comment ID (for Reviewer approvals with explicit or auto-selected Maintainer, key is PR number + approval comment ID).
- The same Worker may run again only after new Reviewer feedback.
- The same Reviewer may run again only after a new Worker commit and
  `[Worker] Revision complete.` signal, or after a tagged Maintainer block.
- Polling or restarting the orchestrator MUST NOT duplicate an event that is
  running or already succeeded.
- An event whose AI process crashed IS retried, up to 3 attempts, so a single
  transient CLI failure cannot deadlock the swarm.

---

## 3. Available AI Agents & Parameters

The orchestrator uses these values when dynamically assigning roles.

| AI Agent | Command | Preset Models | Reasoning Levels | Default Preset |
|----------|---------|---------------|------------------|----------------|
| **Codex** | `codex` | `5.6 terra`, `5.6 sol`, `5.6 spark` | `낮음`, `중간`, `높음` | `5.6 terra` |
| **Antigravity** | `agy` | `gemini 3.6 flash`, `gemini 3.1 pro` | `low`, `medium`, `high` | `gemini 3.6 flash` |
| **Claude** | `claude` | `sonnet 5`, `haiku 3.5` | `낮음`, `중간`, `높음` | `sonnet 5` |

---

## 4. Operational Rules

### 4.1 Worktree Discipline
- EVERY task runs in its own worktree at `.worktrees/<issue#>` (or `.worktrees/<pr#>` for issue-less PRs).
- NEVER switch branches in the main workspace directory.
- Worktrees are created by orchestrator, used by Worker/Reviewer/Maintainer, and removed after merge.

### 4.2 Naming Conventions
| Element | Pattern | Example |
|---------|---------|---------|
| Worktree path | `.worktrees/<issue#>` (or `.worktrees/<pr#>`) | `.worktrees/12` |
| Branch | `worker/<issue#>-<ai>-<short-desc>` | `worker/12-codex-base64-encoder` |
| PR title | `[PR] <issue#> - <Summary>` | `[PR] 12 - Base64 인코더 추가` |

### 4.3 Commit Messages
- Use conventional commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`
- Reference the Issue number: `feat(base64): add encoder (#12)`

---

## 5. Workflow: Issue → PR → Merge

```
1. [Orchestrator] Detects new Issue with [Worker: ...] tag
2. [Orchestrator] Creates worktree: git worktree add .worktrees/<issue#> worker/<issue#>-<ai>-<desc>
3. [Orchestrator] Launches Worker AI in the worktree
4. [Worker AI] Implements the task, commits, pushes branch
5. [Worker AI] Creates PR with [Reviewer: ...] tag in body
6. [Orchestrator] Detects PR with [Reviewer: ...] tag
7. [Orchestrator] Launches Reviewer AI
8. [Reviewer AI] Reviews code and posts one tagged final comment
9. [If changes requested] Orchestrator launches the original Worker once for
   that comment ID
10. [Worker AI] Fixes, commits, pushes, and posts
    `[Worker] Revision complete.`
11. Steps 7–10 repeat only when a new signal exists
12. [If approved] Reviewer approves (adding a distinct [Maintainer: ...] tag or explicit approval signal; for issue-less PRs lacking a Maintainer tag, the orchestrator auto-selects one)
13. [Orchestrator] Launches Maintainer AI once for that approval comment ID
14. [If blocked] Maintainer posts `[Maintainer Blocked]` with its metadata and
    evidence; Orchestrator launches the assigned Reviewer once for that block
    comment ID.
15. [Maintainer AI] Verifies CI, merges PR, closes Issue, analyzes the updated
    project, and creates exactly one non-duplicate follow-up Issue
16. [Orchestrator] Safely removes only the clean merged worktree
```

---

## 6. Chain of Thought (CoT) Communication

**All AIs MUST document their reasoning in GitHub**. This is the only inter-agent communication channel.

### What to Document
- Intent and approach before starting work
- Decision rationale for architectural choices
- Problems encountered and how they were resolved
- Suggestions for improvements

### Where to Document
| Context | Location |
|---------|----------|
| Starting work on an Issue | Comment on the Issue |
| Implementation decisions | PR description |
| Code review feedback | PR review comments |
| Merge rationale | PR merge comment |
| New ideas or improvements | New Issue |

---

## 7. Autonomous Evolution

All AIs are empowered to:

1. **Create new Issues** — if they identify bugs, improvements, or new tool ideas.
2. **Modify rules** — update files in `.agents/rules/` or this `AGENTS.md` if a better approach is found.
   - ⚠️ Rule modifications MUST be documented in the PR body with clear rationale.
3. **Add new skills** — create files in `.agents/skills/` for reusable agent capabilities.
4. **Refine the orchestrator** — propose changes to `.agents/workflows/swarm_orchestrator.py`.

---

## 8. Project Structure

```
.
├── AGENTS.md                          # ← YOU ARE HERE (Single Source of Truth)
├── .agents/
│   ├── rules/
│   │   ├── coding_standards.md        # Code style & quality rules
│   │   ├── review_checklist.md        # PR review checklist
│   │   └── role_assignment.md         # Dynamic role assignment rules
│   ├── workflows/
│   │   └── swarm_orchestrator.py      # Main orchestration script
│   └── skills/                        # Reusable agent skills
├── CLAUDE.md                          # Pointer → AGENTS.md
├── .antigravity/rules/main.md         # Pointer → AGENTS.md
├── .cursorrules                       # Pointer → AGENTS.md
├── src/                               # React application source
├── public/                            # Static assets
├── package.json
├── vite.config.js
└── .worktrees/                        # Git worktrees (gitignored)
```

---

## 9. Quick Reference for AI Agents

> **If you are an AI reading this file, follow these steps:**
>
> 1. Read this entire document and all files in `.agents/rules/`.
> 2. Check your assigned role (Worker/Reviewer/Maintainer) from the Issue/PR metadata.
> 3. Follow the workflow in Section 5.
> 4. Document ALL your reasoning in GitHub (Section 6).
> 5. Use worktrees for all code changes (Section 4.1).
> 6. If you see improvements, create Issues or propose rule changes (Section 7).
