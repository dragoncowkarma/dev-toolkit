#!/usr/bin/env python3
"""
Swarm Orchestrator — Vendor-Agnostic Autonomous Multi-Agent Swarm
=================================================================
Polls GitHub Issues and PRs via `gh` CLI, parses role metadata tags,
creates isolated git worktrees, and dispatches AI agents as subprocesses.

Usage:
    python .agents/workflows/swarm_orchestrator.py [--interval 30] [--dry-run]

Requires: gh CLI authenticated, git, and at least one AI CLI installed.
"""

import argparse
import json
import logging
import os
import re
import shutil
import subprocess
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

REPO_ROOT = Path(__file__).resolve().parents[2]
WORKTREE_DIR = REPO_ROOT / ".worktrees"
POLL_INTERVAL_SECONDS = 30
PROCESSED_ISSUES_FILE = REPO_ROOT / ".agents" / ".processed_issues.json"
PROCESSED_PRS_FILE = REPO_ROOT / ".agents" / ".processed_prs.json"

# Metadata tag patterns
WORKER_PATTERN = re.compile(
    r"\[Worker:\s*(?P<ai>\w+)\s*\|\s*Model:\s*(?P<model>[^|]+?)\s*\|\s*Reasoning:\s*(?P<reasoning>[^\]]+?)\]",
    re.IGNORECASE,
)
REVIEWER_PATTERN = re.compile(
    r"\[Reviewer:\s*(?P<ai>\w+)\s*\|\s*Model:\s*(?P<model>[^|]+?)\s*\|\s*Reasoning:\s*(?P<reasoning>[^\]]+?)\]",
    re.IGNORECASE,
)
MAINTAINER_PATTERN = re.compile(
    r"\[Maintainer:\s*(?P<ai>\w+)\s*\|\s*Model:\s*(?P<model>[^|]+?)\s*\|\s*Reasoning:\s*(?P<reasoning>[^\]]+?)\]",
    re.IGNORECASE,
)

# Default reviewer/maintainer rotation
DEFAULT_ROTATION = {
    "codex":       {"reviewer": "antigravity", "maintainer": "claude"},
    "antigravity": {"reviewer": "claude",      "maintainer": "codex"},
    "claude":      {"reviewer": "codex",       "maintainer": "antigravity"},
}

# AI CLI command templates
AI_CLI_COMMANDS = {
    "codex": 'codex --model {model} --reasoning {reasoning} --prompt "{prompt}" --cwd {cwd}',
    "antigravity": 'agy agent run --model {model} --reasoning {reasoning} --prompt "{prompt}" --cwd {cwd}',
    "claude": 'claude --model {model} --reasoning {reasoning} --print --prompt "{prompt}" --cwd {cwd}',
}

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("swarm")


# ---------------------------------------------------------------------------
# Data Classes
# ---------------------------------------------------------------------------

@dataclass
class RoleAssignment:
    ai: str
    model: str
    reasoning: str


@dataclass
class TaskIssue:
    number: int
    title: str
    body: str
    worker: Optional[RoleAssignment] = None


@dataclass
class TaskPR:
    number: int
    title: str
    body: str
    head_branch: str
    issue_number: Optional[int] = None
    reviewer: Optional[RoleAssignment] = None


# ---------------------------------------------------------------------------
# Persistence — Track processed issues/PRs
# ---------------------------------------------------------------------------

def load_processed(filepath: Path) -> set:
    if filepath.exists():
        with open(filepath) as f:
            return set(json.load(f))
    return set()


def save_processed(filepath: Path, data: set):
    filepath.parent.mkdir(parents=True, exist_ok=True)
    with open(filepath, "w") as f:
        json.dump(sorted(data), f)


# ---------------------------------------------------------------------------
# GitHub CLI Helpers
# ---------------------------------------------------------------------------

def gh(args: list[str], check: bool = True) -> str:
    """Run a gh CLI command and return stdout."""
    cmd = ["gh"] + args
    log.debug("Running: %s", " ".join(cmd))
    result = subprocess.run(cmd, capture_output=True, text=True, cwd=REPO_ROOT, check=check)
    if result.returncode != 0 and check:
        log.error("gh command failed: %s\nstderr: %s", " ".join(cmd), result.stderr)
    return result.stdout.strip()


def fetch_open_issues() -> list[dict]:
    """Fetch open issues with [Task] prefix."""
    raw = gh([
        "issue", "list",
        "--state", "open",
        "--label", "",
        "--json", "number,title,body",
        "--limit", "50",
    ], check=False)
    if not raw:
        return []
    issues = json.loads(raw)
    return [i for i in issues if i.get("title", "").startswith("[Task]")]


def fetch_open_prs() -> list[dict]:
    """Fetch open PRs with [PR] prefix."""
    raw = gh([
        "pr", "list",
        "--state", "open",
        "--json", "number,title,body,headRefName",
        "--limit", "50",
    ], check=False)
    if not raw:
        return []
    prs = json.loads(raw)
    return [p for p in prs if p.get("title", "").startswith("[PR]")]


def fetch_pr_comments(pr_number: int) -> list[dict]:
    """Fetch comments on a PR."""
    raw = gh([
        "pr", "view", str(pr_number),
        "--json", "comments",
    ], check=False)
    if not raw:
        return []
    data = json.loads(raw)
    return data.get("comments", [])


# ---------------------------------------------------------------------------
# Parsing
# ---------------------------------------------------------------------------

def parse_role(pattern: re.Pattern, text: str) -> Optional[RoleAssignment]:
    """Parse a role metadata tag from text."""
    match = pattern.search(text or "")
    if match:
        return RoleAssignment(
            ai=match.group("ai").strip().lower(),
            model=match.group("model").strip(),
            reasoning=match.group("reasoning").strip(),
        )
    return None


def extract_issue_number_from_pr_title(title: str) -> Optional[int]:
    """Extract issue number from PR title like '[PR] 12 - ...'"""
    m = re.search(r"\[PR\]\s*(\d+)", title)
    return int(m.group(1)) if m else None


# ---------------------------------------------------------------------------
# Git Worktree Management
# ---------------------------------------------------------------------------

def create_worktree(issue_number: int, branch_name: str) -> Path:
    """Create an isolated git worktree for a task."""
    worktree_path = WORKTREE_DIR / str(issue_number)

    if worktree_path.exists():
        log.info("Worktree already exists: %s", worktree_path)
        return worktree_path

    WORKTREE_DIR.mkdir(parents=True, exist_ok=True)

    # Create branch from current HEAD if it doesn't exist
    existing_branches = subprocess.run(
        ["git", "branch", "--list", branch_name],
        capture_output=True, text=True, cwd=REPO_ROOT,
    ).stdout.strip()

    if not existing_branches:
        subprocess.run(
            ["git", "branch", branch_name],
            cwd=REPO_ROOT, check=True,
        )

    subprocess.run(
        ["git", "worktree", "add", str(worktree_path), branch_name],
        cwd=REPO_ROOT, check=True,
    )
    log.info("Created worktree: %s on branch %s", worktree_path, branch_name)
    return worktree_path


def cleanup_worktree(issue_number: int, branch_name: str):
    """Remove worktree and optionally the branch."""
    worktree_path = WORKTREE_DIR / str(issue_number)

    if worktree_path.exists():
        subprocess.run(
            ["git", "worktree", "remove", str(worktree_path), "--force"],
            cwd=REPO_ROOT, check=False,
        )
        log.info("Removed worktree: %s", worktree_path)

    # Delete branch if it was merged
    subprocess.run(
        ["git", "branch", "-d", branch_name],
        cwd=REPO_ROOT, check=False,
    )


# ---------------------------------------------------------------------------
# AI Agent Dispatch
# ---------------------------------------------------------------------------

def build_ai_command(ai_name: str, model: str, reasoning: str, prompt: str, cwd: str) -> str:
    """Build the CLI command string for an AI agent."""
    template = AI_CLI_COMMANDS.get(ai_name)
    if not template:
        log.error("Unknown AI agent: %s", ai_name)
        return ""
    return template.format(
        model=model,
        reasoning=reasoning,
        prompt=prompt.replace('"', '\\"'),
        cwd=cwd,
    )


def dispatch_worker(issue: TaskIssue, dry_run: bool = False):
    """Dispatch a Worker AI to implement a task."""
    worker = issue.worker
    if not worker:
        log.warning("Issue #%d has no Worker tag, skipping.", issue.number)
        return

    # Extract short description from title, handling Korean/Unicode gracefully
    title_parts = issue.title.split("-")
    raw_desc = title_parts[-1].strip() if len(title_parts) > 1 else issue.title
    short_desc = re.sub(r"[^a-z0-9]+", "-", raw_desc.lower()).strip("-")[:30]
    if not short_desc:
        short_desc = f"task-{issue.number}"
    branch_name = f"worker/{issue.number}-{worker.ai}-{short_desc}"
    worktree_path = create_worktree(issue.number, branch_name)

    prompt = (
        f"You are the Worker for Issue #{issue.number}: {issue.title}.\n"
        f"Read AGENTS.md and .agents/rules/ for all project rules.\n"
        f"Implement the task described in the Issue body:\n\n{issue.body}\n\n"
        f"Work inside this directory. When done:\n"
        f"1. Commit your changes with conventional commit messages referencing #{issue.number}.\n"
        f"2. Push the branch '{branch_name}'.\n"
        f"3. Create a PR titled '[PR] {issue.number} - <summary>' with a [Reviewer: ...] tag in the body.\n"
        f"4. Document your reasoning in the PR description."
    )

    cmd = build_ai_command(worker.ai, worker.model, worker.reasoning, prompt, str(worktree_path))

    if dry_run:
        log.info("[DRY RUN] Would execute: %s", cmd)
        return

    log.info("Dispatching Worker %s for Issue #%d", worker.ai, issue.number)
    log.info("Command: %s", cmd)

    try:
        subprocess.Popen(
            cmd,
            shell=True,
            cwd=str(worktree_path),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
    except Exception as e:
        log.error("Failed to dispatch Worker: %s", e)


def dispatch_reviewer(pr: TaskPR, dry_run: bool = False):
    """Dispatch a Reviewer AI to review a PR."""
    reviewer = pr.reviewer
    if not reviewer:
        log.warning("PR #%d has no Reviewer tag, skipping.", pr.number)
        return

    prompt = (
        f"You are the Reviewer for PR #{pr.number}: {pr.title}.\n"
        f"Read AGENTS.md and .agents/rules/review_checklist.md for review rules.\n"
        f"Review the PR diff, check code quality, and leave review comments.\n"
        f"If approved, add a [Maintainer: ...] tag in your approval comment.\n"
        f"Follow the review checklist in .agents/rules/review_checklist.md."
    )

    cmd = build_ai_command(reviewer.ai, reviewer.model, reviewer.reasoning, prompt, str(REPO_ROOT))

    if dry_run:
        log.info("[DRY RUN] Would execute reviewer: %s", cmd)
        return

    log.info("Dispatching Reviewer %s for PR #%d", reviewer.ai, pr.number)
    try:
        subprocess.Popen(cmd, shell=True, cwd=str(REPO_ROOT), stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    except Exception as e:
        log.error("Failed to dispatch Reviewer: %s", e)


def dispatch_maintainer(pr_number: int, maintainer: RoleAssignment, dry_run: bool = False):
    """Dispatch a Maintainer AI to merge a PR."""
    prompt = (
        f"You are the Maintainer for PR #{pr_number}.\n"
        f"Read AGENTS.md for project rules.\n"
        f"Verify the PR review is complete, CI passes, and merge the PR.\n"
        f"After merging, comment with your [Maintainer: ...] metadata tag.\n"
        f"Then clean up: the orchestrator will handle worktree removal."
    )

    cmd = build_ai_command(maintainer.ai, maintainer.model, maintainer.reasoning, prompt, str(REPO_ROOT))

    if dry_run:
        log.info("[DRY RUN] Would execute maintainer: %s", cmd)
        return

    log.info("Dispatching Maintainer %s for PR #%d", maintainer.ai, pr_number)
    try:
        subprocess.Popen(cmd, shell=True, cwd=str(REPO_ROOT), stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    except Exception as e:
        log.error("Failed to dispatch Maintainer: %s", e)


# ---------------------------------------------------------------------------
# Main Polling Loop
# ---------------------------------------------------------------------------

def process_issues(dry_run: bool = False):
    """Poll and process new Issues with [Task] prefix."""
    processed = load_processed(PROCESSED_ISSUES_FILE)
    issues = fetch_open_issues()

    for raw in issues:
        num = raw["number"]
        if num in processed:
            continue

        worker = parse_role(WORKER_PATTERN, raw.get("body", ""))
        if not worker:
            log.debug("Issue #%d has no Worker metadata, skipping.", num)
            continue

        issue = TaskIssue(
            number=num,
            title=raw["title"],
            body=raw.get("body", ""),
            worker=worker,
        )

        log.info("=== New Task Issue #%d: %s ===", num, issue.title)
        log.info("Worker: %s | Model: %s | Reasoning: %s", worker.ai, worker.model, worker.reasoning)

        dispatch_worker(issue, dry_run)

        processed.add(num)
        save_processed(PROCESSED_ISSUES_FILE, processed)


def process_prs(dry_run: bool = False):
    """Poll and process PRs that need review or merge."""
    processed = load_processed(PROCESSED_PRS_FILE)
    prs = fetch_open_prs()

    for raw in prs:
        pr_num = raw["number"]
        pr_key = f"review-{pr_num}"

        if pr_key not in processed:
            reviewer = parse_role(REVIEWER_PATTERN, raw.get("body", ""))
            if reviewer:
                pr = TaskPR(
                    number=pr_num,
                    title=raw["title"],
                    body=raw.get("body", ""),
                    head_branch=raw.get("headRefName", ""),
                    reviewer=reviewer,
                )
                log.info("=== PR #%d needs review: %s ===", pr_num, pr.title)
                dispatch_reviewer(pr, dry_run)
                processed.add(pr_key)
                save_processed(PROCESSED_PRS_FILE, processed)

        # Check for Maintainer tag in comments
        maint_key = f"maintain-{pr_num}"
        if maint_key not in processed:
            comments = fetch_pr_comments(pr_num)
            for comment in comments:
                maintainer = parse_role(MAINTAINER_PATTERN, comment.get("body", ""))
                if maintainer:
                    log.info("=== PR #%d approved, dispatching Maintainer ===", pr_num)
                    dispatch_maintainer(pr_num, maintainer, dry_run)
                    processed.add(maint_key)
                    save_processed(PROCESSED_PRS_FILE, processed)
                    break


def run_loop(interval: int, dry_run: bool = False):
    """Main polling loop."""
    log.info("=" * 60)
    log.info("Swarm Orchestrator started")
    log.info("Repo root: %s", REPO_ROOT)
    log.info("Poll interval: %ds", interval)
    log.info("Dry run: %s", dry_run)
    log.info("=" * 60)

    while True:
        try:
            log.info("--- Polling cycle ---")
            process_issues(dry_run)
            process_prs(dry_run)
        except KeyboardInterrupt:
            log.info("Shutting down gracefully...")
            break
        except Exception as e:
            log.error("Error in polling cycle: %s", e, exc_info=True)

        log.info("Sleeping %ds...", interval)
        time.sleep(interval)


# ---------------------------------------------------------------------------
# Entry Point
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Swarm Orchestrator — Autonomous Multi-Agent Swarm for Dev Toolkit",
    )
    parser.add_argument(
        "--interval", type=int, default=POLL_INTERVAL_SECONDS,
        help=f"Polling interval in seconds (default: {POLL_INTERVAL_SECONDS})",
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Print commands without executing them",
    )
    parser.add_argument(
        "--once", action="store_true",
        help="Run a single polling cycle and exit",
    )
    args = parser.parse_args()

    if args.once:
        log.info("Running single polling cycle...")
        process_issues(args.dry_run)
        process_prs(args.dry_run)
        log.info("Done.")
    else:
        run_loop(args.interval, args.dry_run)


if __name__ == "__main__":
    main()
