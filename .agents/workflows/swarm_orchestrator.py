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
PROCESS_REGISTRY_FILE = REPO_ROOT / ".agents" / ".process_registry.json"

# A lifecycle event runs at most once successfully, but a crashed process is
# retried so a transient AI CLI failure cannot deadlock the swarm forever.
MAX_DISPATCH_ATTEMPTS = 3

# Stable reasons returned by ProcessTracker.should_dispatch().
DISPATCH_RUNNING = "already running"
DISPATCH_COMPLETED = "already completed"

# Upper bound on persisted history so the registry cannot grow without limit.
MAX_HISTORY_RECORDS = 500

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

# Blocker states already reported, so a stuck PR cannot flood the log on every
# polling cycle. Keys include the head SHA or comment ID, so a new lifecycle
# signal is always reported again.
_REPORTED_BLOCKERS: set[str] = set()


def log_blocker(key: str, message: str, *args, level: int = logging.ERROR):
    """Report a lifecycle blocker once at `level`, then at DEBUG while it persists."""
    if key in _REPORTED_BLOCKERS:
        log.debug(message, *args)
        return
    if len(_REPORTED_BLOCKERS) > MAX_HISTORY_RECORDS:
        _REPORTED_BLOCKERS.clear()
    _REPORTED_BLOCKERS.add(key)
    log.log(level, message, *args)


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
    head_sha: str = ""
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
        self._reconcile_orphans()

    def _reconcile_orphans(self):
        """Demote records left RUNNING by a crashed orchestrator.

        A previous run that died without `kill_all()` leaves records claiming to
        be running. Treating those as live would block their lifecycle event
        forever, so any record whose PID is gone becomes UNKNOWN and therefore
        retryable.
        """
        for record in self._history:
            if record.status != ProcessStatus.RUNNING:
                continue
            if self.check_pid_alive(record.pid):
                continue
            record.status = ProcessStatus.UNKNOWN
            record.ended_at = record.ended_at or datetime.now(timezone.utc).isoformat()
            log.warning(
                "Orphaned %s record for %s [PID %d] marked UNKNOWN; event is retryable.",
                record.role, record.task_ref, record.pid,
            )

    def _save_registry(self):
        """Persist process registry to disk."""
        PROCESS_REGISTRY_FILE.parent.mkdir(parents=True, exist_ok=True)
        if len(self._history) > MAX_HISTORY_RECORDS:
            self._history = self._history[-MAX_HISTORY_RECORDS:]
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

    def is_active(self, task_ref: str, role: str) -> bool:
        """Check if there is an active process for the given task and role."""
        for tp in self.active_processes:
            if tp.task_ref == task_ref and tp.role == role:
                return True
        return False

    def should_dispatch(self, task_ref: str, role: str) -> tuple[bool, str]:
        """Decide whether a lifecycle event still needs a process, with a reason.

        Task references identify lifecycle events rather than only an Issue or
        PR, so dispatch stays idempotent across polling cycles and orchestrator
        restarts while the Worker/Reviewer loop can still advance when a new
        review comment or commit creates a new event.

        A running or completed attempt blocks the event permanently. A crashed
        attempt is retried up to MAX_DISPATCH_ATTEMPTS times, because a swarm
        that abandons an event after one failed AI process stalls forever.
        """
        attempts = [
            record for record in self.all_records
            if record.task_ref == task_ref and record.role == role
        ]
        if not attempts:
            return True, "new event"
        if any(record.status == ProcessStatus.RUNNING for record in attempts):
            return False, DISPATCH_RUNNING
        if any(record.status == ProcessStatus.COMPLETED for record in attempts):
            return False, DISPATCH_COMPLETED
        if len(attempts) >= MAX_DISPATCH_ATTEMPTS:
            return False, f"exhausted {len(attempts)} failed attempts"
        return True, f"retry {len(attempts) + 1}/{MAX_DISPATCH_ATTEMPTS} after failure"

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
        "--json", "number,title,body,headRefName,headRefOid",
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


def fetch_issue(issue_number: int) -> Optional[dict]:
    """Fetch a specific issue by number."""
    raw = gh([
        "issue", "view", str(issue_number),
        "--json", "number,title,body"
    ], check=False)
    if not raw:
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return None


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


def comment_signal_id(comment: dict, index: int) -> str:
    """Build a stable identifier for a GitHub comment signal."""
    raw_id = str(comment.get("id") or comment.get("url") or f"index-{index}")
    return re.sub(r"[^a-zA-Z0-9._-]+", "-", raw_id).strip("-")


def validate_distinct_roles(
    worker: Optional[RoleAssignment],
    reviewer: Optional[RoleAssignment],
    maintainer: Optional[RoleAssignment] = None,
) -> tuple[bool, str]:
    """Validate that every assigned lifecycle role uses a different AI."""
    assignments = {
        "Worker": worker,
        "Reviewer": reviewer,
        "Maintainer": maintainer,
    }
    seen: dict[str, str] = {}
    for role, assignment in assignments.items():
        if assignment is None:
            continue
        previous_role = seen.get(assignment.ai)
        if previous_role:
            return (
                False,
                f"{previous_role} and {role} both use AI '{assignment.ai}'",
            )
        seen[assignment.ai] = role
    return True, ""


def determine_pr_action(comments: list[dict]) -> tuple[str, Optional[dict], int]:
    """Return the next action from the newest recognized lifecycle signal.

    Recognized signals are Reviewer feedback, Worker revision completion, and
    Reviewer approval containing a Maintainer assignment. Informational comments
    do not change state.

    An approval must carry BOTH a Reviewer and a Maintainer tag. A lone
    Maintainer tag — a human quoting the rules, or another agent naming a
    candidate — is informational, because treating it as approval would freeze
    the PR on a "maintain" action that later validation always rejects.
    """
    latest_action = "review"
    latest_comment: Optional[dict] = None
    latest_index = -1

    for index, comment in enumerate(comments):
        body = comment.get("body", "")
        maintainer = parse_role(MAINTAINER_PATTERN, body)
        reviewer = parse_role(REVIEWER_PATTERN, body)

        if maintainer and reviewer:
            latest_action = "maintain"
            latest_comment = comment
            latest_index = index
        elif "[Worker] Revision complete." in body:
            latest_action = "review"
            latest_comment = comment
            latest_index = index
        elif reviewer:
            latest_action = "revise"
            latest_comment = comment
            latest_index = index

    return latest_action, latest_comment, latest_index


# ---------------------------------------------------------------------------
# Git Worktree Management
# ---------------------------------------------------------------------------

def local_branch_exists(branch_name: str) -> bool:
    """Return whether a local branch of this name exists."""
    result = subprocess.run(
        ["git", "branch", "--list", branch_name],
        capture_output=True, text=True, cwd=REPO_ROOT, check=False,
    )
    return bool(result.stdout.strip())


def create_worktree(issue_number: int, branch_name: str) -> Path:
    """Create an isolated git worktree for a task."""
    worktree_path = WORKTREE_DIR / str(issue_number)

    if worktree_path.exists():
        log.info("Worktree already exists: %s", worktree_path)
        return worktree_path

    WORKTREE_DIR.mkdir(parents=True, exist_ok=True)

    # Create branch from current HEAD if it doesn't exist
    if not local_branch_exists(branch_name):
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
    """Safely remove a clean, merged task worktree and its local branch."""
    worktree_path = WORKTREE_DIR / str(issue_number)

    # Merged PRs are re-listed every polling cycle, so exit before spending any
    # subprocess or log output on work that is already done.
    if not worktree_path.exists() and not local_branch_exists(branch_name):
        return

    expected_prefix = f"worker/{issue_number}-"
    if not branch_name.startswith(expected_prefix):
        log_blocker(
            f"cleanup:{issue_number}:{branch_name}",
            "Refusing cleanup for unexpected branch '%s' (expected prefix '%s').",
            branch_name,
            expected_prefix,
        )
        return

    if worktree_path.exists():
        git_link = worktree_path / ".git"
        if not git_link.exists():
            # Prunable worktree: .git file is missing so `git worktree remove`
            # will fail with "validation failed". Prune git's internal refs and
            # remove the orphaned directory manually.
            log.warning(
                "Worktree %s is prunable (missing .git file); "
                "pruning refs and removing directory.",
                worktree_path,
            )
            subprocess.run(
                ["git", "worktree", "prune"],
                cwd=REPO_ROOT, check=False,
            )
            shutil.rmtree(worktree_path, ignore_errors=True)
            log.info("Removed prunable worktree: %s", worktree_path)
        else:
            status = subprocess.run(
                ["git", "status", "--porcelain"],
                cwd=worktree_path,
                capture_output=True,
                text=True,
                check=False,
            )
            if status.returncode != 0 or status.stdout.strip():
                log_blocker(
                    f"dirty-worktree:{issue_number}",
                    "Refusing to remove non-clean worktree for Issue #%d: %s",
                    issue_number,
                    worktree_path,
                    level=logging.WARNING,
                )
                return

            removed = subprocess.run(
                ["git", "worktree", "remove", str(worktree_path)],
                cwd=REPO_ROOT,
                check=False,
            )
            if removed.returncode != 0:
                log.warning("Failed to remove worktree: %s", worktree_path)
                return
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
        # codex exec: -C workdir, prompt is positional
        # --dangerously-bypass-approvals-and-sandbox for autonomous mode
        # -s workspace-write to allow file edits
        return [
            "codex", "exec",
            "-C", cwd,
            "-s", "workspace-write",
            "--dangerously-bypass-approvals-and-sandbox",
            prompt_text,
        ]

    elif ai_name == "antigravity":
        # agy: -p for non-interactive
        # --dangerously-skip-permissions for autonomous mode
        # cwd is set via subprocess cwd parameter
        return [
            "agy",
            "--dangerously-skip-permissions",
            "-p", prompt_text,
        ]

    elif ai_name == "claude":
        # claude: -p for print mode, prompt is positional
        # --dangerously-skip-permissions for autonomous mode
        # cwd is set via subprocess cwd parameter
        return [
            "claude",
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


def dispatch_worker(
    issue: TaskIssue,
    dry_run: bool = False,
    task_ref: Optional[str] = None,
):
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
        f"3. Create a PR titled '[PR] {issue.number} - <summary>' with a "
        f"[Reviewer: ...] tag in the body.\n"
        f"4. The Reviewer AI MUST be different from Worker AI '{worker.ai}'.\n"
        f"5. Document your decisions and verification evidence in the PR description.\n\n"
        f"CRITICAL: You are running as a background worker in a fully autonomous swarm. "
        f"Do NOT use planning mode. Do NOT request human feedback, approval, or ask questions. "
        f"Execute your task completely and exit."
    )

    task_ref = task_ref or f"issue#{issue.number}:initial"
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
            stderr=stderr_file, stdin=subprocess.DEVNULL, 
            
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


def dispatch_reviewer(
    pr: TaskPR,
    worker: RoleAssignment,
    dry_run: bool = False,
    task_ref: Optional[str] = None,
):
    """Dispatch a Reviewer AI to review a PR."""
    reviewer = pr.reviewer
    if not reviewer:
        log.warning("PR #%d has no Reviewer tag, skipping.", pr.number)
        return

    prompt = (
        f"You are the Reviewer for PR #{pr.number}: {pr.title}.\n"
        f"Read AGENTS.md and .agents/rules/review_checklist.md for review rules.\n"
        f"Review the PR diff, check code quality, and leave review comments.\n\n"
        f"When your review is complete, you MUST post exactly ONE final summary comment "
        f"on the PR containing your [Reviewer: ...] metadata tag. The tag format is:\n"
        f"  [Reviewer: {reviewer.ai} | Model: {reviewer.model} | "
        f"Reasoning: {reviewer.reasoning}]\n\n"
        f"If the PR is approved and ready to merge, your final comment MUST also include:\n"
        f"  [Maintainer: <ai_name> | Model: <model> | Reasoning: <level>]\n"
        f"Choose the Maintainer using .agents/rules/role_assignment.md. It MUST differ "
        f"from Worker '{worker.ai}' and Reviewer '{reviewer.ai}'.\n\n"
        f"If changes are needed, your final comment MUST include your [Reviewer: ...] tag "
        f"AND clearly describe all required changes. Do NOT include "
        f"[Maintainer: ...] in this case.\n\n"
        f"Follow the review checklist in .agents/rules/review_checklist.md.\n\n"
        f"CRITICAL: You are running as a background reviewer in a fully autonomous swarm. "
        f"Do NOT use planning mode. Do NOT request human feedback, approval, or ask questions. "
        f"Execute your review completely and exit."
    )

    task_ref = task_ref or f"review#{pr.number}-{pr.head_sha or 'initial'}"
    prompt_file = write_prompt_file(prompt, "reviewer", task_ref)
    argv = build_ai_argv(
        reviewer.ai,
        reviewer.model,
        reviewer.reasoning,
        prompt_file,
        str(REPO_ROOT),
    )

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
            stderr=stderr_file, stdin=subprocess.DEVNULL, 
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


def dispatch_maintainer(
    pr: TaskPR,
    issue: TaskIssue,
    maintainer: RoleAssignment,
    dry_run: bool = False,
    task_ref: Optional[str] = None,
):
    """Dispatch AI3 to maintain the PR and seed the next autonomous task."""
    prompt = (
        f"You are AI3, the Maintainer and post-merge Analyst for PR #{pr.number} "
        f"(Issue #{issue.number}).\n"
        f"Read AGENTS.md and .agents/rules/ for all project rules.\n"
        f"1. Verify that the independent review is complete and CI passes.\n"
        f"2. Merge PR #{pr.number}. A successful merge closes the PR.\n"
        f"3. Close Issue #{issue.number} only after the merge succeeds.\n"
        f"4. Comment on the PR with your exact metadata:\n"
        f"   [Maintainer: {maintainer.ai} | Model: {maintainer.model} | "
        f"Reasoning: {maintainer.reasoning}]\n"
        f"   Include the merge rationale and verification evidence.\n"
        f"5. Analyze the updated project and all open Issues after the merge.\n"
        f"6. Create exactly ONE non-duplicate follow-up Issue titled "
        f"'[Task] <Tool Name> - <Summary>'. Include requirements, acceptance criteria, "
        f"and a valid [Worker: <ai> | Model: <model> | Reasoning: <level>] tag.\n"
        f"7. Do not implement the follow-up Issue yourself. The orchestrator will "
        f"dispatch its Worker in the next polling cycle.\n"
        f"8. The orchestrator will safely remove the merged worktree.\n\n"
        f"CRITICAL: You are running as a background maintainer in a fully autonomous swarm. "
        f"Do NOT use planning mode. Do NOT request human feedback, approval, or ask questions. "
        f"Execute your task completely and exit."
    )

    task_ref = task_ref or f"maintain#{pr.number}"
    prompt_file = write_prompt_file(prompt, "maintainer", task_ref)
    argv = build_ai_argv(
        maintainer.ai,
        maintainer.model,
        maintainer.reasoning,
        prompt_file,
        str(REPO_ROOT),
    )

    if dry_run:
        log.info("[DRY RUN] Would execute maintainer: %s", _format_argv_for_log(argv))
        return

    if not argv:
        return

    log_path, stdout_file, stderr_file = create_log_files("maintainer", task_ref, maintainer.ai)
    log.info("Dispatching Maintainer %s for PR #%d (log: %s)", maintainer.ai, pr.number, log_path)

    try:
        proc = subprocess.Popen(
            argv,
            cwd=str(REPO_ROOT),
            stdout=stdout_file,
            stderr=stderr_file, stdin=subprocess.DEVNULL, 
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


def dispatch_worker_revision(
    pr: TaskPR,
    issue: TaskIssue,
    feedback_text: str,
    dry_run: bool = False,
    task_ref: Optional[str] = None,
):
    """Dispatch the original Worker AI to fix the PR based on feedback."""
    worker = issue.worker
    if not worker:
        log.warning(
            "Issue #%d has no Worker tag, cannot dispatch revision for PR #%d.",
            issue.number,
            pr.number,
        )
        return

    # Reuse the PR's actual branch so a title-derived branch cannot diverge.
    branch_name = pr.head_branch
    if not branch_name:
        log.warning("PR #%d has no head branch, cannot dispatch revision.", pr.number)
        return
    
    # We must run inside the same worktree or recreate it
    worktree_path = create_worktree(issue.number, branch_name)

    prompt = (
        f"You are the Worker for PR #{pr.number} (Issue #{issue.number}: {issue.title}).\n"
        f"Read AGENTS.md and .agents/rules/ for all project rules.\n"
        f"You previously created this PR, but additional modifications were requested. "
        f"Here is the feedback/comments:\n\n{feedback_text}\n\n"
        f"Work inside this directory. When done:\n"
        f"1. Fix the code according to the feedback.\n"
        f"2. Commit your changes with conventional commit messages.\n"
        f"3. Push the branch '{branch_name}'.\n"
        f"4. Add a comment to the PR containing EXACTLY the phrase:\n"
        f"   [Worker] Revision complete.\n"
        f"   indicating it is ready for another review.\n\n"
        f"CRITICAL: You are running as a background worker in a fully autonomous swarm. "
        f"Do NOT use planning mode. Do NOT request human feedback, approval, or ask questions. "
        f"Execute your task completely and exit."
    )

    if not task_ref:
        task_ref = f"revise#{pr.number}"
    prompt_file = write_prompt_file(prompt, "worker-revise", task_ref)
    argv = build_ai_argv(worker.ai, worker.model, worker.reasoning, prompt_file, str(worktree_path))

    if dry_run:
        log.info("[DRY RUN] Would execute worker revision: %s", _format_argv_for_log(argv))
        return

    if not argv:
        return

    log_path, stdout_file, stderr_file = create_log_files("worker_revise", task_ref, worker.ai)
    log.info("Dispatching Worker %s for PR #%d Revision (log: %s)", worker.ai, pr.number, log_path)
    log.info("  argv: %s", _format_argv_for_log(argv))

    try:
        proc = subprocess.Popen(
            argv,
            cwd=str(worktree_path),
            stdout=stdout_file,
            stderr=stderr_file, stdin=subprocess.DEVNULL,
        )
        tracker.register(
            proc=proc,
            role="worker_revise",
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
        log.error("Failed to dispatch Worker Revision: %s", e)


# ---------------------------------------------------------------------------
# Main Polling Loop
# ---------------------------------------------------------------------------

def process_issues(dry_run: bool = False, open_prs: list[dict] = None):
    """Poll and dispatch each initial Issue event at most once."""
    issues = fetch_open_issues()
    if open_prs is None:
        open_prs = fetch_open_prs()
        
    pr_issue_numbers = set()
    for pr in open_prs:
        pr_title = pr.get("title", "")
        issue_num = extract_issue_number_from_pr_title(pr_title)
        if issue_num:
            pr_issue_numbers.add(issue_num)

    for raw in issues:
        num = raw["number"]
        
        # 1. If PR already exists, Worker is done (or PR handles the rest)
        if num in pr_issue_numbers:
            continue
            
        # 2. A persistent event key prevents repeat dispatch after completion.
        task_ref = f"issue#{num}:initial"
        allowed, reason = tracker.should_dispatch(task_ref, role="worker")
        if not allowed:
            log.debug("Skipping Worker for Issue #%d: %s.", num, reason)
            continue

        # 3. Dispatch Worker
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

        log.info(
            "=== Open Task Issue #%d needs Worker (%s): %s ===",
            num, reason, issue.title,
        )
        dispatch_worker(issue, dry_run, task_ref=task_ref)


def process_prs(dry_run: bool = False, open_prs: list[dict] = None):
    """Advance each PR by one idempotent Worker/Reviewer/Maintainer event."""
    prs = open_prs if open_prs is not None else fetch_open_prs()

    for raw in prs:
        pr_num = raw["number"]
        pr_title = raw.get("title", "")
        pr_body = raw.get("body", "")
        head_branch = raw.get("headRefName", "")
        head_sha = raw.get("headRefOid", "")
        issue_number = extract_issue_number_from_pr_title(pr_title)

        # Validate cheaply before spending API calls on comments and the Issue.
        if issue_number is None:
            log_blocker(
                f"pr-title:{pr_num}",
                "PR #%d has no Issue number in its title; refusing role dispatch.",
                pr_num,
            )
            continue

        reviewer = parse_role(REVIEWER_PATTERN, pr_body)
        if not reviewer:
            log_blocker(
                f"pr-reviewer:{pr_num}:{head_sha}",
                "PR #%d has no Reviewer metadata; refusing dispatch.",
                pr_num,
            )
            continue

        issue_raw = fetch_issue(issue_number)
        if not issue_raw:
            log_blocker(
                f"pr-issue:{pr_num}:{issue_number}",
                "Could not fetch Issue #%d for PR #%d.", issue_number, pr_num,
            )
            continue

        worker = parse_role(WORKER_PATTERN, issue_raw.get("body", ""))
        if not worker:
            log_blocker(
                f"pr-worker:{pr_num}:{issue_number}",
                "Issue #%d has no Worker metadata; refusing dispatch for PR #%d.",
                issue_number, pr_num,
            )
            continue

        comments = fetch_pr_comments(pr_num)

        pr_obj = TaskPR(
            number=pr_num,
            title=pr_title,
            body=pr_body,
            head_branch=head_branch,
            head_sha=head_sha,
            issue_number=issue_number,
        )

        issue_obj = TaskIssue(
            number=issue_number,
            title=issue_raw["title"],
            body=issue_raw.get("body", ""),
            worker=worker,
        )
        pr_obj.reviewer = reviewer
        action, signal_comment, signal_index = determine_pr_action(comments)
        signal_id = (
            comment_signal_id(signal_comment, signal_index)
            if signal_comment is not None
            else "initial"
        )

        if action == "maintain":
            approval_reviewer = parse_role(
                REVIEWER_PATTERN,
                signal_comment.get("body", ""),
            )
            maintainer = parse_role(
                MAINTAINER_PATTERN,
                signal_comment.get("body", ""),
            )
            if not approval_reviewer or approval_reviewer.ai != reviewer.ai:
                log_blocker(
                    f"approval-reviewer:{pr_num}:{signal_id}",
                    "PR #%d approval signal does not match assigned Reviewer '%s'.",
                    pr_num,
                    reviewer.ai,
                )
                continue
            valid, why = validate_distinct_roles(worker, reviewer, maintainer)
            if not valid:
                log_blocker(
                    f"roles:{pr_num}:{signal_id}",
                    "PR #%d role assignment rejected: %s.", pr_num, why,
                )
                continue

            task_ref = f"maintain#{pr_num}-{signal_id}"
            allowed, reason = tracker.should_dispatch(task_ref, role="maintainer")
            if not allowed:
                log.debug("Skipping Maintainer for PR #%d: %s.", pr_num, reason)
                continue
            log.info(
                "=== PR #%d approved, dispatching AI3 Maintainer (%s) ===",
                pr_num, reason,
            )
            dispatch_maintainer(
                pr_obj,
                issue_obj,
                maintainer,
                dry_run,
                task_ref=task_ref,
            )
            continue

        valid, why = validate_distinct_roles(worker, reviewer)
        if not valid:
            log_blocker(
                f"roles:{pr_num}:{head_sha}",
                "PR #%d role assignment rejected: %s.", pr_num, why,
            )
            continue

        if action == "review":
            review_version = head_sha or signal_id
            task_ref = f"review#{pr_num}-{review_version}"
            allowed, reason = tracker.should_dispatch(task_ref, role="reviewer")
            if not allowed:
                # A finished review on an unchanged head SHA cannot produce a
                # new event key, so the lifecycle would stall in silence: either
                # the Worker never pushed, or the Reviewer posted no tagged
                # comment. A review still running is normal and stays quiet.
                if signal_comment is not None and reason == DISPATCH_COMPLETED:
                    log_blocker(
                        f"stale-revision:{pr_num}:{signal_id}",
                        "PR #%d already reviewed head SHA %s and has no newer signal; "
                        "the Worker may not have pushed, or the Reviewer left no tag.",
                        pr_num, review_version,
                        level=logging.WARNING,
                    )
                log.debug("Skipping Reviewer for PR #%d: %s.", pr_num, reason)
                continue
            log.info(
                "=== PR #%d needs review for %s (%s) ===",
                pr_num, review_version, reason,
            )
            dispatch_reviewer(
                pr_obj,
                worker,
                dry_run,
                task_ref=task_ref,
            )
            continue

        task_ref = f"revise#{pr_num}-{signal_id}"
        allowed, reason = tracker.should_dispatch(task_ref, role="worker_revise")
        if not allowed:
            log.debug("Skipping Worker revision for PR #%d: %s.", pr_num, reason)
            continue
        feedback_reviewer = parse_role(
            REVIEWER_PATTERN,
            signal_comment.get("body", ""),
        )
        if not feedback_reviewer or feedback_reviewer.ai != reviewer.ai:
            log_blocker(
                f"feedback-reviewer:{pr_num}:{signal_id}",
                "PR #%d feedback signal does not match assigned Reviewer '%s'.",
                pr_num,
                reviewer.ai,
            )
            continue
        log.info(
            "=== PR #%d needs Worker revision for %s (%s) ===",
            pr_num, signal_id, reason,
        )
        dispatch_worker_revision(
            pr_obj,
            issue_obj,
            signal_comment.get("body", ""),
            dry_run,
            task_ref=task_ref,
        )


def close_issue_if_open(issue_num: int, pr_num: int, dry_run: bool):
    """Close the Issue behind a merged PR if it is still open."""
    issue_raw = gh(["issue", "view", str(issue_num), "--json", "state"], check=False)
    if not issue_raw:
        return
    if json.loads(issue_raw).get("state") != "OPEN":
        return
    log.info("🧹 PR #%d is merged. Closing associated Issue #%d", pr_num, issue_num)
    if not dry_run:
        gh(["issue", "close", str(issue_num)], check=False)


def cleanup_merged_prs(dry_run: bool = False):
    """Close merged Issues and safely clean their task worktrees."""
    raw = gh([
        "pr", "list",
        "--state", "merged",
        "--limit", "20",
        "--json", "number,title,headRefName",
    ], check=False)
    if not raw:
        return
    try:
        merged_prs = json.loads(raw)
    except json.JSONDecodeError:
        return
        
    for pr in merged_prs:
        pr_title = pr.get("title", "")
        issue_num = extract_issue_number_from_pr_title(pr_title)
        if not issue_num:
            continue

        try:
            close_issue_if_open(issue_num, pr["number"], dry_run)
        except Exception as e:
            log.error("Failed to check/close issue #%d: %s", issue_num, e)

        # Worktree cleanup is independent of the Issue state: a failed Issue
        # lookup must not leave the merged worktree behind forever.
        branch_name = pr.get("headRefName", "")
        if branch_name and not dry_run:
            try:
                cleanup_worktree(issue_num, branch_name)
            except Exception as e:
                log.error("Failed to clean worktree for issue #%d: %s", issue_num, e)


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
            open_prs = fetch_open_prs()
            process_issues(dry_run, open_prs)
            process_prs(dry_run, open_prs)
            
            # 3. Clean up merged PR issues
            cleanup_merged_prs(dry_run)

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
        open_prs = fetch_open_prs()
        process_issues(args.dry_run, open_prs)
        process_prs(args.dry_run, open_prs)
        cleanup_merged_prs(args.dry_run)
        tracker.poll_all()
        log.info("Done.")
    else:
        run_loop(args.interval, args.dry_run)


if __name__ == "__main__":
    main()
