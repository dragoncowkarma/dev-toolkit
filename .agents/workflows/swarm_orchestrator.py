#!/usr/bin/env python3
"""
Swarm Orchestrator — Vendor-Agnostic Autonomous Multi-Agent Swarm
=================================================================
Polls GitHub Issues and PRs via `gh` CLI, parses role metadata tags,
creates isolated git worktrees, and dispatches AI agents as subprocesses.

Usage:
    python .agents/workflows/swarm_orchestrator.py [--interval 30] [--dry-run]
    python .agents/workflows/swarm_orchestrator.py --status

Requires: gh CLI authenticated, git, and at least one AI CLI installed.
"""

import argparse
import json
import logging
import os
import re
import shutil
import signal
import subprocess
import sys
import tempfile
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Optional

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

REPO_ROOT = Path(__file__).resolve().parents[2]
WORKTREE_DIR = REPO_ROOT / ".worktrees"
LOG_DIR = REPO_ROOT / ".agents" / "logs"
POLL_INTERVAL_SECONDS = 30
PROCESSED_ISSUES_FILE = REPO_ROOT / ".agents" / ".processed_issues.json"
PROCESSED_PRS_FILE = REPO_ROOT / ".agents" / ".processed_prs.json"
PROCESS_REGISTRY_FILE = REPO_ROOT / ".agents" / ".process_registry.json"

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

# Prompt temp file directory (cleaned on shutdown)
PROMPT_DIR = REPO_ROOT / ".agents" / ".prompts"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("swarm")


# ---------------------------------------------------------------------------
# Data Classes
# ---------------------------------------------------------------------------

class ProcessStatus(str, Enum):
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    UNKNOWN = "unknown"


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


@dataclass
class TrackedProcess:
    """A dispatched AI subprocess with full lifecycle metadata."""
    pid: int
    role: str           # "worker", "reviewer", "maintainer"
    ai_name: str
    model: str
    reasoning: str
    task_ref: str        # e.g. "issue#3" or "pr#5"
    branch: str
    command: str
    cwd: str
    log_file: str
    started_at: str      # ISO 8601
    ended_at: Optional[str] = None
    exit_code: Optional[int] = None
    status: str = ProcessStatus.RUNNING


# ---------------------------------------------------------------------------
# Process Tracker — PID registry with poll()-based status checks
# ---------------------------------------------------------------------------

class ProcessTracker:
    """Tracks all dispatched AI subprocesses and their lifecycle."""

    def __init__(self):
        self._active: dict[int, tuple[subprocess.Popen, TrackedProcess]] = {}
        self._history: list[TrackedProcess] = []
        self._load_registry()

    # --- Persistence ---

    def _load_registry(self):
        """Load previous process history from disk (for --status across runs)."""
        if PROCESS_REGISTRY_FILE.exists():
            try:
                with open(PROCESS_REGISTRY_FILE) as f:
                    data = json.load(f)
                for entry in data.get("history", []):
                    self._history.append(TrackedProcess(**entry))
            except (json.JSONDecodeError, TypeError):
                log.warning("Corrupted process registry, starting fresh.")

    def _save_registry(self):
        """Persist process registry to disk."""
        PROCESS_REGISTRY_FILE.parent.mkdir(parents=True, exist_ok=True)
        all_records = self._history + [tp for _, tp in self._active.values()]
        with open(PROCESS_REGISTRY_FILE, "w") as f:
            json.dump({
                "last_updated": datetime.now(timezone.utc).isoformat(),
                "history": [vars(r) for r in all_records],
            }, f, indent=2, ensure_ascii=False)

    # --- Registration ---

    def register(self, proc: subprocess.Popen, role: str, ai_name: str,
                 model: str, reasoning: str, task_ref: str, branch: str,
                 command: str, cwd: str, log_file: str) -> TrackedProcess:
        """Register a newly launched subprocess."""
        tracked = TrackedProcess(
            pid=proc.pid,
            role=role,
            ai_name=ai_name,
            model=model,
            reasoning=reasoning,
            task_ref=task_ref,
            branch=branch,
            command=command,
            cwd=cwd,
            log_file=log_file,
            started_at=datetime.now(timezone.utc).isoformat(),
        )
        self._active[proc.pid] = (proc, tracked)
        log.info(
            "📌 Registered %s [PID %d] — %s (%s, %s)",
            role, proc.pid, task_ref, ai_name, model,
        )
        self._save_registry()
        return tracked

    # --- Polling ---

    def poll_all(self):
        """Check status of all active processes via poll(). Non-blocking."""
        finished_pids = []

        for pid, (proc, tracked) in self._active.items():
            retcode = proc.poll()

            if retcode is None:
                # Still running — log a heartbeat
                elapsed = self._elapsed_str(tracked.started_at)
                log.info(
                    "⏳ [PID %d] %s %s — running for %s",
                    pid, tracked.role.upper(), tracked.task_ref, elapsed,
                )
            else:
                # Process finished
                tracked.exit_code = retcode
                tracked.ended_at = datetime.now(timezone.utc).isoformat()
                elapsed = self._elapsed_str(tracked.started_at)

                if retcode == 0:
                    tracked.status = ProcessStatus.COMPLETED
                    log.info(
                        "✅ [PID %d] %s %s — completed successfully (%s)",
                        pid, tracked.role.upper(), tracked.task_ref, elapsed,
                    )
                else:
                    tracked.status = ProcessStatus.FAILED
                    # Capture last lines of stderr for diagnostics
                    stderr_tail = self._read_tail(proc.stderr, 500)
                    log.error(
                        "❌ [PID %d] %s %s — failed (exit %d, %s)\n  stderr: %s",
                        pid, tracked.role.upper(), tracked.task_ref,
                        retcode, elapsed, stderr_tail or "(empty)",
                    )

                finished_pids.append(pid)

        # Move finished processes to history
        for pid in finished_pids:
            _, tracked = self._active.pop(pid)
            self._history.append(tracked)

        if finished_pids:
            self._save_registry()

    def check_pid_alive(self, pid: int) -> bool:
        """Check if a PID is still alive via OS signal 0."""
        try:
            os.kill(pid, 0)
            return True
        except ProcessLookupError:
            return False
        except PermissionError:
            return True  # Alive, just can't signal it

    # --- Queries ---

    @property
    def active_count(self) -> int:
        return len(self._active)

    @property
    def active_processes(self) -> list[TrackedProcess]:
        return [tp for _, tp in self._active.values()]

    @property
    def all_records(self) -> list[TrackedProcess]:
        return self._history + [tp for _, tp in self._active.values()]

    def get_summary(self) -> str:
        """Generate a human-readable status summary."""
        lines = []
        lines.append("=" * 72)
        lines.append("🤖 SWARM PROCESS STATUS")
        lines.append("=" * 72)

        # Active processes
        active = self.active_processes
        lines.append(f"\n🟢 Active ({len(active)}):")
        if active:
            for tp in active:
                elapsed = self._elapsed_str(tp.started_at)
                lines.append(
                    f"  PID {tp.pid:>7}  │ {tp.role:<12} │ {tp.ai_name:<14} │ "
                    f"{tp.task_ref:<12} │ ⏱ {elapsed}"
                )
        else:
            lines.append("  (none)")

        # Recent history (last 10)
        recent = self._history[-10:]
        lines.append(f"\n📜 Recent History (last {len(recent)}):")
        if recent:
            for tp in recent:
                icon = "✅" if tp.status == ProcessStatus.COMPLETED else "❌"
                duration = self._duration_str(tp.started_at, tp.ended_at)
                lines.append(
                    f"  {icon} PID {tp.pid:>7}  │ {tp.role:<12} │ {tp.ai_name:<14} │ "
                    f"{tp.task_ref:<12} │ exit={tp.exit_code} │ ⏱ {duration}"
                )
        else:
            lines.append("  (none)")

        # Stats
        total = len(self._history)
        succeeded = sum(1 for tp in self._history if tp.status == ProcessStatus.COMPLETED)
        failed = sum(1 for tp in self._history if tp.status == ProcessStatus.FAILED)
        lines.append(f"\n📊 Totals: {total} finished ({succeeded} ✅, {failed} ❌), {len(active)} running")
        lines.append("=" * 72)
        return "\n".join(lines)

    # --- Cleanup ---

    def kill_all(self):
        """Send SIGTERM to all active processes."""
        for pid, (proc, tracked) in list(self._active.items()):
            log.warning("🛑 Killing [PID %d] %s %s", pid, tracked.role, tracked.task_ref)
            try:
                proc.terminate()
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
            tracked.exit_code = proc.returncode
            tracked.ended_at = datetime.now(timezone.utc).isoformat()
            tracked.status = ProcessStatus.FAILED
            self._history.append(tracked)
        self._active.clear()
        self._save_registry()

    # --- Helpers ---

    @staticmethod
    def _elapsed_str(started_at: str) -> str:
        start = datetime.fromisoformat(started_at)
        delta = datetime.now(timezone.utc) - start
        secs = int(delta.total_seconds())
        if secs < 60:
            return f"{secs}s"
        if secs < 3600:
            return f"{secs // 60}m {secs % 60}s"
        return f"{secs // 3600}h {(secs % 3600) // 60}m"

    @staticmethod
    def _duration_str(started_at: str, ended_at: Optional[str]) -> str:
        if not ended_at:
            return "?"
        start = datetime.fromisoformat(started_at)
        end = datetime.fromisoformat(ended_at)
        secs = int((end - start).total_seconds())
        if secs < 60:
            return f"{secs}s"
        if secs < 3600:
            return f"{secs // 60}m {secs % 60}s"
        return f"{secs // 3600}h {(secs % 3600) // 60}m"

    @staticmethod
    def _read_tail(stream, max_bytes: int = 500) -> str:
        if stream is None:
            return ""
        try:
            data = stream.read()
            if isinstance(data, bytes):
                data = data.decode("utf-8", errors="replace")
            return data[-max_bytes:] if data else ""
        except Exception:
            return ""


# Global tracker instance
tracker = ProcessTracker()


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
# Log File Management
# ---------------------------------------------------------------------------

def create_log_files(role: str, task_ref: str, ai_name: str) -> tuple[Path, "IO", "IO"]:
    """Create log files and return (log_path, stdout_file, stderr_file).

    Returns open file objects (not raw fds) so they stay open for the
    lifetime of the subprocess and are cleaned up by the GC.
    """
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    safe_ref = re.sub(r"[^a-z0-9]+", "-", task_ref.lower())
    log_path = LOG_DIR / f"{timestamp}_{role}_{ai_name}_{safe_ref}.log"

    log_file = open(log_path, "w", encoding="utf-8")
    log_file.write(
        f"--- Swarm AI Process Log ---\n"
        f"Role:      {role}\n"
        f"AI:        {ai_name}\n"
        f"Task:      {task_ref}\n"
        f"Started:   {datetime.now(timezone.utc).isoformat()}\n"
        f"---\n\n"
    )
    log_file.flush()
    return log_path, log_file, log_file


def write_prompt_file(prompt: str, role: str, task_ref: str) -> Path:
    """Write prompt to a temp file and return its path.

    Using a file avoids shell escaping issues and OS ARG_MAX limits
    that break when long multi-line Korean/Unicode prompts are passed
    as command-line arguments.
    """
    PROMPT_DIR.mkdir(parents=True, exist_ok=True)
    safe_ref = re.sub(r"[^a-z0-9]+", "-", task_ref.lower())
    prompt_path = PROMPT_DIR / f"{role}_{safe_ref}.md"
    prompt_path.write_text(prompt, encoding="utf-8")
    return prompt_path


# ---------------------------------------------------------------------------
# AI Agent Dispatch — builds argv lists (NOT shell strings)
# ---------------------------------------------------------------------------

def build_ai_argv(ai_name: str, model: str, reasoning: str,
                  prompt_file: Path, cwd: str) -> list[str]:
    """Build an argv list for a specific AI CLI tool.

    Each tool's actual flags (verified via --help):
      codex exec -m <model> -C <dir> -s workspace-write --dangerously-bypass-approvals-and-sandbox <prompt_from_stdin>
      agy -p --model <model> --effort <level> --dangerously-skip-permissions <prompt_from_file>
      claude -p --model <model> --dangerously-skip-permissions <prompt_from_file>
    """
    prompt_text = prompt_file.read_text(encoding="utf-8")

    if ai_name == "codex":
        # codex exec: -m model, -C workdir, prompt is positional or stdin
        # --dangerously-bypass-approvals-and-sandbox for autonomous mode
        # -s workspace-write to allow file edits
        return [
            "codex", "exec",
            "-m", model,
            "-C", cwd,
            "-s", "workspace-write",
            "--dangerously-bypass-approvals-and-sandbox",
            prompt_text,
        ]

    elif ai_name == "antigravity":
        # agy: --model, --effort (not --reasoning), -p for non-interactive
        # --dangerously-skip-permissions for autonomous mode
        # cwd is set via subprocess cwd parameter
        return [
            "agy",
            "--model", model,
            "--effort", _map_reasoning_to_effort(reasoning),
            "--dangerously-skip-permissions",
            "-p", prompt_text,
        ]

    elif ai_name == "claude":
        # claude: --model, -p for print mode, prompt is positional
        # --dangerously-skip-permissions for autonomous mode
        # cwd is set via subprocess cwd parameter
        return [
            "claude",
            "--model", model,
            "-p",
            "--dangerously-skip-permissions",
            prompt_text,
        ]

    else:
        log.error("Unknown AI agent: %s", ai_name)
        return []


def _map_reasoning_to_effort(reasoning: str) -> str:
    """Map AGENTS.md reasoning levels to agy --effort values."""
    mapping = {
        "high": "high", "높음": "high", "울트라": "high",
        "매우 높음": "high",
        "medium": "medium", "중간": "medium",
        "low": "low", "낮음": "low", "light": "low",
        "thinking": "high",
        "엑스트라": "high", "최대": "high", "ultracode": "high",
    }
    return mapping.get(reasoning.lower().strip(), "medium")


def _format_argv_for_log(argv: list[str]) -> str:
    """Format argv for human-readable logging (truncate long prompts)."""
    parts = []
    for arg in argv:
        if len(arg) > 200:
            parts.append(arg[:100] + "...[truncated]")
        else:
            parts.append(arg)
    return " ".join(parts)


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

    task_ref = f"issue#{issue.number}"
    prompt_file = write_prompt_file(prompt, "worker", task_ref)
    argv = build_ai_argv(worker.ai, worker.model, worker.reasoning, prompt_file, str(worktree_path))

    if dry_run:
        log.info("[DRY RUN] Would execute: %s", _format_argv_for_log(argv))
        return

    if not argv:
        return

    log_path, stdout_file, stderr_file = create_log_files("worker", task_ref, worker.ai)
    log.info("Dispatching Worker %s for Issue #%d (log: %s)", worker.ai, issue.number, log_path)
    log.info("  argv: %s", _format_argv_for_log(argv))

    try:
        proc = subprocess.Popen(
            argv,
            cwd=str(worktree_path),
            stdout=stdout_file,
            stderr=stderr_file,
        )
        tracker.register(
            proc=proc,
            role="worker",
            ai_name=worker.ai,
            model=worker.model,
            reasoning=worker.reasoning,
            task_ref=task_ref,
            branch=branch_name,
            command=_format_argv_for_log(argv),
            cwd=str(worktree_path),
            log_file=str(log_path),
        )
    except FileNotFoundError:
        log.error("AI CLI '%s' not found in PATH. Is it installed?", argv[0])
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

    task_ref = f"pr#{pr.number}"
    prompt_file = write_prompt_file(prompt, "reviewer", task_ref)
    argv = build_ai_argv(reviewer.ai, reviewer.model, reviewer.reasoning, prompt_file, str(REPO_ROOT))

    if dry_run:
        log.info("[DRY RUN] Would execute reviewer: %s", _format_argv_for_log(argv))
        return

    if not argv:
        return

    log_path, stdout_file, stderr_file = create_log_files("reviewer", task_ref, reviewer.ai)
    log.info("Dispatching Reviewer %s for PR #%d (log: %s)", reviewer.ai, pr.number, log_path)

    try:
        proc = subprocess.Popen(
            argv,
            cwd=str(REPO_ROOT),
            stdout=stdout_file,
            stderr=stderr_file,
        )
        tracker.register(
            proc=proc,
            role="reviewer",
            ai_name=reviewer.ai,
            model=reviewer.model,
            reasoning=reviewer.reasoning,
            task_ref=task_ref,
            branch=pr.head_branch,
            command=_format_argv_for_log(argv),
            cwd=str(REPO_ROOT),
            log_file=str(log_path),
        )
    except FileNotFoundError:
        log.error("AI CLI '%s' not found in PATH. Is it installed?", argv[0])
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

    task_ref = f"pr#{pr_number}"
    prompt_file = write_prompt_file(prompt, "maintainer", task_ref)
    argv = build_ai_argv(maintainer.ai, maintainer.model, maintainer.reasoning, prompt_file, str(REPO_ROOT))

    if dry_run:
        log.info("[DRY RUN] Would execute maintainer: %s", _format_argv_for_log(argv))
        return

    if not argv:
        return

    log_path, stdout_file, stderr_file = create_log_files("maintainer", task_ref, maintainer.ai)
    log.info("Dispatching Maintainer %s for PR #%d (log: %s)", maintainer.ai, pr_number, log_path)

    try:
        proc = subprocess.Popen(
            argv,
            cwd=str(REPO_ROOT),
            stdout=stdout_file,
            stderr=stderr_file,
        )
        tracker.register(
            proc=proc,
            role="maintainer",
            ai_name=maintainer.ai,
            model=maintainer.model,
            reasoning=maintainer.reasoning,
            task_ref=task_ref,
            branch="",
            command=_format_argv_for_log(argv),
            cwd=str(REPO_ROOT),
            log_file=str(log_path),
        )
    except FileNotFoundError:
        log.error("AI CLI '%s' not found in PATH. Is it installed?", argv[0])
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
    """Main polling loop with process status monitoring."""
    log.info("=" * 60)
    log.info("Swarm Orchestrator started")
    log.info("Repo root: %s", REPO_ROOT)
    log.info("Poll interval: %ds", interval)
    log.info("Dry run: %s", dry_run)
    log.info("Log directory: %s", LOG_DIR)
    log.info("=" * 60)

    # Graceful shutdown on SIGTERM/SIGINT
    def handle_signal(signum, frame):
        log.info("Received signal %d, shutting down...", signum)
        tracker.kill_all()
        sys.exit(0)

    signal.signal(signal.SIGTERM, handle_signal)
    signal.signal(signal.SIGINT, handle_signal)

    while True:
        try:
            log.info("--- Polling cycle (active: %d) ---", tracker.active_count)

            # 1. Check status of all running AI processes
            tracker.poll_all()

            # 2. Poll for new work
            process_issues(dry_run)
            process_prs(dry_run)

        except KeyboardInterrupt:
            log.info("Shutting down gracefully...")
            tracker.kill_all()
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
    parser.add_argument(
        "--status", action="store_true",
        help="Print status of all tracked AI processes and exit",
    )
    args = parser.parse_args()

    if args.status:
        print(tracker.get_summary())
        return

    if args.once:
        log.info("Running single polling cycle...")
        process_issues(args.dry_run)
        process_prs(args.dry_run)
        tracker.poll_all()
        log.info("Done.")
    else:
        run_loop(args.interval, args.dry_run)


if __name__ == "__main__":
    main()
