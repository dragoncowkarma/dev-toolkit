"""Regression tests for the swarm lifecycle state machine."""

import importlib.util
import json
import subprocess
import sys
import tempfile
import time
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch


MODULE_PATH = Path(__file__).with_name("swarm_orchestrator.py")
SPEC = importlib.util.spec_from_file_location("swarm_orchestrator", MODULE_PATH)
swarm = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(swarm)


class FakeTracker:
    """Minimal tracker double with persistent-event semantics."""

    def __init__(self, dispatched=None):
        self.dispatched = set(dispatched or [])
        self.registered = []

    def should_dispatch(
        self,
        task_ref,
        role,
        completion_confirmed=True,
        ai_name=None,
    ):
        if (task_ref, role) in self.dispatched:
            if not completion_confirmed:
                return False, swarm.DISPATCH_UNCONFIRMED
            return False, swarm.DISPATCH_COMPLETED
        return True, "new event"

    def register(self, **kwargs):
        self.registered.append(kwargs)


def make_tracker(history):
    """Build a ProcessTracker with a fixed history and no disk access."""
    tracker = swarm.ProcessTracker.__new__(swarm.ProcessTracker)
    tracker._active = {}
    tracker._history = list(history)
    return tracker


def record(
    task_ref,
    role,
    status,
    pid=1234,
    retry_after=None,
    ai_name="codex",
    defer_scope=None,
):
    return SimpleNamespace(
        task_ref=task_ref,
        role=role,
        status=status,
        pid=pid,
        retry_after=retry_after,
        ai_name=ai_name,
        defer_scope=defer_scope,
    )


class DispatchDecisionTests(unittest.TestCase):
    def test_completed_event_is_never_dispatched_again(self):
        tracker = make_tracker([
            record("review#12-abc123", "reviewer", swarm.ProcessStatus.COMPLETED),
        ])

        self.assertFalse(tracker.should_dispatch("review#12-abc123", "reviewer")[0])
        self.assertTrue(tracker.should_dispatch("review#12-def456", "reviewer")[0])

    def test_completed_process_blocks_when_transition_is_unconfirmed(self):
        tracker = make_tracker([
            record("review#12-abc123", "reviewer", swarm.ProcessStatus.COMPLETED),
        ])

        allowed, reason = tracker.should_dispatch(
            "review#12-abc123",
            "reviewer",
            completion_confirmed=False,
        )

        self.assertFalse(allowed)
        self.assertEqual(swarm.DISPATCH_UNCONFIRMED, reason)

    def test_running_event_is_not_dispatched_again(self):
        tracker = make_tracker([
            record("review#12-abc123", "reviewer", swarm.ProcessStatus.RUNNING),
        ])

        allowed, reason = tracker.should_dispatch("review#12-abc123", "reviewer")

        self.assertFalse(allowed)
        self.assertEqual(swarm.DISPATCH_RUNNING, reason)

    def test_crashed_event_is_retried_within_the_attempt_budget(self):
        tracker = make_tracker([
            record("issue#7:initial", "worker", swarm.ProcessStatus.FAILED),
        ])

        allowed, reason = tracker.should_dispatch("issue#7:initial", "worker")

        self.assertTrue(allowed)
        self.assertIn("retry 2", reason)

    def test_retries_stop_at_the_attempt_budget(self):
        tracker = make_tracker([
            record("issue#7:initial", "worker", swarm.ProcessStatus.FAILED)
            for _ in range(swarm.MAX_DISPATCH_ATTEMPTS)
        ])

        allowed, reason = tracker.should_dispatch("issue#7:initial", "worker")

        self.assertFalse(allowed)
        self.assertIn("exhausted", reason)

    def test_provider_cooldown_does_not_consume_crash_attempt_budget(self):
        retry_after = (
            datetime.now(timezone.utc) + timedelta(minutes=30)
        ).isoformat()
        tracker = make_tracker([
            record(
                "review#12-abc123",
                "reviewer",
                swarm.ProcessStatus.DEFERRED,
                retry_after=retry_after,
            )
            for _ in range(swarm.MAX_DISPATCH_ATTEMPTS)
        ])

        allowed, reason = tracker.should_dispatch(
            "review#12-abc123",
            "reviewer",
            completion_confirmed=False,
        )

        self.assertFalse(allowed)
        self.assertIn(swarm.DISPATCH_PROVIDER_COOLDOWN, reason)

    def test_expired_provider_cooldown_is_retryable(self):
        retry_after = (
            datetime.now(timezone.utc) - timedelta(seconds=1)
        ).isoformat()
        tracker = make_tracker([
            record(
                "issue#7:initial",
                "worker",
                swarm.ProcessStatus.DEFERRED,
                retry_after=retry_after,
            ),
        ])

        allowed, reason = tracker.should_dispatch("issue#7:initial", "worker")

        self.assertTrue(allowed)
        self.assertIn("provider cooldown", reason)

    def test_provider_cooldown_blocks_other_events_for_same_ai(self):
        retry_after = (
            datetime.now(timezone.utc) + timedelta(minutes=30)
        ).isoformat()
        tracker = make_tracker([
            record(
                "maintain#39-comment",
                "maintainer",
                swarm.ProcessStatus.DEFERRED,
                retry_after=retry_after,
                ai_name="antigravity",
                defer_scope="provider",
            ),
        ])

        allowed, reason = tracker.should_dispatch(
            "issue#28:initial",
            "worker",
            ai_name="antigravity",
        )
        other_ai_allowed, _ = tracker.should_dispatch(
            "issue#28:initial",
            "worker",
            ai_name="codex",
        )

        self.assertFalse(allowed)
        self.assertIn(swarm.DISPATCH_PROVIDER_COOLDOWN, reason)
        self.assertTrue(other_ai_allowed)

    def test_event_timeout_does_not_pause_other_events_for_same_ai(self):
        retry_after = (
            datetime.now(timezone.utc) + timedelta(minutes=30)
        ).isoformat()
        tracker = make_tracker([
            record(
                "review#30-abc123",
                "reviewer",
                swarm.ProcessStatus.DEFERRED,
                retry_after=retry_after,
                ai_name="antigravity",
                defer_scope="event",
            ),
        ])

        allowed, _ = tracker.should_dispatch(
            "issue#28:initial",
            "worker",
            ai_name="antigravity",
        )

        self.assertTrue(allowed)

    def test_orphaned_running_record_becomes_retryable(self):
        orphan = swarm.TrackedProcess(
            pid=999999, role="worker", ai_name="codex", model="5.6 sol",
            reasoning="높음", task_ref="issue#7:initial", branch="worker/7-codex-json",
            command="codex exec", cwd=".", log_file="x.log",
            started_at="2026-07-30T00:00:00+00:00",
            status=swarm.ProcessStatus.RUNNING,
        )
        tracker = make_tracker([orphan])

        with patch.object(swarm.ProcessTracker, "check_pid_alive", return_value=False):
            tracker._reconcile_orphans()

        self.assertEqual(swarm.ProcessStatus.UNKNOWN, orphan.status)
        self.assertTrue(tracker.should_dispatch("issue#7:initial", "worker")[0])

    def test_history_is_capped_on_save(self):
        tracker = make_tracker([
            record(f"issue#{i}:initial", "worker", swarm.ProcessStatus.COMPLETED)
            for i in range(swarm.MAX_HISTORY_RECORDS + 25)
        ])

        with patch.object(swarm, "PROCESS_REGISTRY_FILE", Path(tempfile.mkdtemp()) / "r.json"):
            tracker._save_registry()

        self.assertEqual(swarm.MAX_HISTORY_RECORDS, len(tracker._history))


class ProviderFailureTests(unittest.TestCase):
    def test_provider_reset_duration_becomes_retry_timestamp(self):
        ended_at = "2026-07-30T02:45:26+00:00"

        retry_after = swarm.ProcessTracker._provider_retry_after(
            "Error: Individual quota reached. Resets in 1h30m21s.",
            ended_at,
        )

        self.assertEqual("2026-07-30T04:16:47+00:00", retry_after)

    def test_monthly_spend_limit_uses_extended_cooldown(self):
        ended_at = "2026-07-30T02:37:57+00:00"

        retry_after = swarm.ProcessTracker._provider_retry_after(
            "You've hit your monthly spend limit",
            ended_at,
        )

        self.assertEqual("2026-07-31T02:37:57+00:00", retry_after)

    def test_cli_timeout_uses_default_cooldown(self):
        ended_at = "2026-07-30T02:19:35+00:00"

        retry_after = swarm.ProcessTracker._provider_retry_after(
            "Error: timeout waiting for response",
            ended_at,
        )

        self.assertEqual("2026-07-30T03:19:35+00:00", retry_after)

    def test_regular_failure_has_no_provider_cooldown(self):
        self.assertIsNone(
            swarm.ProcessTracker._provider_retry_after(
                "Error: invalid command line option",
            )
        )

    def test_historical_no_tool_completion_is_reclassified(self):
        temp_dir = Path(tempfile.mkdtemp())
        log_file = temp_dir / "process.log"
        log_file.write_text("NO_TOOL_WITHDRAWN\n", encoding="utf-8")
        tracked = swarm.TrackedProcess(
            pid=1234,
            role="reviewer",
            ai_name="antigravity",
            model="gemini 3.1 pro",
            reasoning="high",
            task_ref="review#33-abc123",
            branch="worker/23-codex-hash",
            command="agy -p",
            cwd="/repo",
            log_file=str(log_file),
            started_at="2026-07-30T02:13:30+00:00",
            ended_at="2026-07-30T02:17:23+00:00",
            exit_code=0,
            status=swarm.ProcessStatus.COMPLETED,
        )
        tracker = make_tracker([tracked])

        tracker._reclassify_deferred_failures()

        self.assertEqual(swarm.ProcessStatus.DEFERRED, tracked.status)
        self.assertEqual("NO_TOOL_WITHDRAWN", tracked.failure_reason)
        self.assertEqual("2026-07-30T03:17:23+00:00", tracked.retry_after)
        self.assertEqual("event", tracked.defer_scope)

    def test_log_tail_reads_combined_redirected_output(self):
        temp_dir = Path(tempfile.mkdtemp())
        log_file = temp_dir / "process.log"
        log_file.write_text(
            "header\nYou've hit your monthly spend limit\n",
            encoding="utf-8",
        )

        output = swarm.ProcessTracker._read_log_tail(str(log_file), 2000)

        self.assertIn("monthly spend limit", output)

    def test_poll_records_visible_quota_reason_as_deferred(self):
        temp_dir = Path(tempfile.mkdtemp())
        log_file = temp_dir / "process.log"
        log_file.write_text(
            "Error: Individual quota reached. Resets in 5m.\n",
            encoding="utf-8",
        )
        tracked = swarm.TrackedProcess(
            pid=1234,
            role="maintainer",
            ai_name="antigravity",
            model="gemini 3.1 pro",
            reasoning="high",
            task_ref="maintain#39-comment",
            branch="",
            command="agy -p",
            cwd="/repo",
            log_file=str(log_file),
            started_at=datetime.now(timezone.utc).isoformat(),
        )
        tracker = make_tracker([])
        tracker._active[1234] = (
            SimpleNamespace(poll=lambda: 1),
            tracked,
        )

        with patch.object(tracker, "_save_registry"):
            tracker.poll_all()

        self.assertEqual(swarm.ProcessStatus.DEFERRED, tracked.status)
        self.assertIn("Individual quota reached", tracked.failure_reason)
        self.assertIsNotNone(tracked.retry_after)
        self.assertEqual("provider", tracked.defer_scope)


class AiArgvTests(unittest.TestCase):
    def setUp(self):
        temp_dir = Path(tempfile.mkdtemp())
        self.prompt_file = temp_dir / "prompt.md"
        self.prompt_file.write_text("Do the task.", encoding="utf-8")

    def test_codex_preserves_fully_qualified_model(self):
        argv = swarm.build_ai_argv(
            "codex", "gpt-5.6-sol", "높음", self.prompt_file, "/repo",
        )

        self.assertEqual("gpt-5.6-sol", argv[argv.index("-m") + 1])

    def test_codex_maps_agent_metadata_to_supported_cli_model(self):
        argv = swarm.build_ai_argv(
            "codex", "5.6", "높음", self.prompt_file, "/repo",
        )

        self.assertEqual("gpt-5.6-terra", argv[argv.index("-m") + 1])

    def test_codex_maps_parenthesized_role_model(self):
        argv = swarm.build_ai_argv(
            "codex", "5.6 (sol)", "높음", self.prompt_file, "/repo",
        )

        self.assertEqual("gpt-5.6-sol", argv[argv.index("-m") + 1])

    def test_invalid_model_falls_back_to_default(self):
        argv = swarm.build_ai_argv(
            "codex", "custom-provider-model", "높음", self.prompt_file, "/repo",
        )

        # Should fall back to codex default 'gpt-5.6-terra'
        self.assertEqual("gpt-5.6-terra", argv[argv.index("-m") + 1])

    def test_antigravity_resolves_model_family_and_effort(self):
        argv = swarm.build_ai_argv(
            "antigravity", "gemini 3.1 pro", "high", self.prompt_file, "/repo",
        )

        self.assertEqual("Gemini 3.1 Pro (High)", argv[argv.index("--model") + 1])
        self.assertNotIn("--effort", argv)

    def test_claude_resolves_model_and_effort(self):
        argv = swarm.build_ai_argv(
            "claude", "sonnet 5", "중간", self.prompt_file, "/repo",
        )

        self.assertEqual("claude-sonnet-5", argv[argv.index("--model") + 1])
        self.assertEqual("medium", argv[argv.index("--effort") + 1])


class LifecycleSignalTests(unittest.TestCase):

    def test_latest_recognized_signal_controls_action(self):
        comments = [
            {
                "id": "review-1",
                "body": (
                    "[Reviewer: antigravity | Model: gemini 3.6 flash | "
                    "Reasoning: high]\nFix the test."
                ),
            },
            {"id": "noise", "body": "CI is still running."},
            {"id": "worker-1", "body": "[Worker] Revision complete."},
        ]

        action, comment, index = swarm.determine_pr_action(comments)

        self.assertEqual("review", action)
        self.assertEqual("worker-1", comment["id"])
        self.assertEqual(2, index)

    def test_approval_is_a_maintainer_signal(self):
        comments = [{
            "id": "approval-1",
            "body": (
                "[Reviewer: antigravity | Model: gemini 3.6 flash | "
                "Reasoning: high]\n"
                "[Maintainer: claude | Model: sonnet 5 | Reasoning: 높음]"
            ),
        }]

        action, comment, _ = swarm.determine_pr_action(comments)

        self.assertEqual("maintain", action)
        self.assertEqual("approval-1", comment["id"])

    def test_negated_approval_phrase_returns_revise(self):
        """A review comment containing 'Not approved' must not match approval pattern and must return revise action."""
        comments = [{
            "id": "negated-approval-1",
            "body": (
                "[Reviewer: antigravity | Model: gemini 3.6 flash | Reasoning: high]\n"
                "Not approved: coverage is missing."
            ),
        }]

        action, comment, _ = swarm.determine_pr_action(comments)

        self.assertEqual("revise", action)
        self.assertEqual("negated-approval-1", comment["id"])

    def test_negative_lgtm_feedback_returns_revise(self):
        """Review comments with negative or conditional LGTM wording must return revise action."""
        cases = [
            "Not LGTM: regression remains.",
            "not LGTM",
            "No LGTM",
            "cannot LGTM",
            "not LGTM at all",
            "Changes are still required; LGTM after the regression test is added.",
            "Changes are still required",
            "LGTM after the regression test is added",
            "LGTM once tests are added",
            "Approved once docs are updated",
        ]
        for phrase in cases:
            with self.subTest(phrase=phrase):
                comments = [{
                    "id": "c-neg-lgtm",
                    "body": (
                        "[Reviewer: antigravity | Model: gemini 3.6 flash | Reasoning: high]\n"
                        + phrase
                    ),
                }]
                action, comment, _ = swarm.determine_pr_action(comments)
                self.assertEqual("revise", action)
                self.assertEqual("c-neg-lgtm", comment["id"])

    def test_maintainer_block_is_a_reviewer_signal(self):
        comments = [{
            "id": "maintainer-block-1",
            "body": (
                "[Maintainer: claude | Model: sonnet 5 | Reasoning: 높음]\n"
                "[Maintainer Blocked]\n"
                "Classification: test. Evidence: npm test fails."
            ),
        }]

        action, comment, _ = swarm.determine_pr_action(comments)

        self.assertEqual("review_after_maintainer_block", action)
        self.assertEqual("maintainer-block-1", comment["id"])

    def test_reviewer_instruction_does_not_become_worker_signal(self):
        comments = [{
            "id": "review-2",
            "body": (
                "Fix the issue, then post [Worker] Revision complete.\n"
                "[Reviewer: codex | Model: 5.6 | Reasoning: 높음]"
            ),
        }]

        action, comment, _ = swarm.determine_pr_action(comments)

        self.assertEqual("revise", action)
        self.assertEqual("review-2", comment["id"])

    def test_lone_maintainer_tag_is_informational(self):
        comments = [{
            "id": "human-1",
            "body": "Reminder: approvals need [Maintainer: claude | Model: sonnet 5 | Reasoning: 높음].",
        }]

        action, comment, index = swarm.determine_pr_action(comments)

        self.assertEqual("review", action)
        self.assertIsNone(comment)
        self.assertEqual(-1, index)

    def test_duplicate_ai_across_roles_is_rejected(self):
        worker = swarm.RoleAssignment("codex", "5.6 sol", "높음")
        reviewer = swarm.RoleAssignment("codex", "5.6 terra", "높음")

        valid, reason = swarm.validate_distinct_roles(worker, reviewer)

        self.assertFalse(valid)
        self.assertIn("both use AI 'codex'", reason)


class StartupScanTests(unittest.TestCase):
    def test_open_issue_fetch_keeps_non_task_items_visible(self):
        payload = (
            '[{"number": 7, "title": "[Task] JSON", "body": "worker"}, '
            '{"number": 8, "title": "Bug report", "body": ""}]'
        )
        with patch.object(swarm, "gh", return_value=payload):
            issues = swarm.fetch_open_issues()

        self.assertEqual([7, 8], [issue["number"] for issue in issues])

    def test_open_pr_fetch_keeps_nonstandard_items_visible(self):
        payload = (
            '[{"number": 12, "title": "[PR] 7 - JSON"}, '
            '{"number": 13, "title": "Draft fix"}]'
        )
        with patch.object(swarm, "gh", return_value=payload):
            prs = swarm.fetch_open_prs()

        self.assertEqual([12, 13], [pr["number"] for pr in prs])

    def test_initial_cycle_scans_both_collections_before_processing(self):
        issues = [{"number": 7, "title": "[Task] JSON"}]
        prs = [{"number": 12, "title": "[PR] 7 - JSON"}]
        with (
            patch.object(swarm, "fetch_open_issues", return_value=issues),
            patch.object(swarm, "fetch_open_prs", return_value=prs),
            patch.object(swarm, "log_open_items") as log_open_items,
            patch.object(swarm, "process_issues") as process_issues,
            patch.object(swarm, "process_prs") as process_prs,
            patch.object(swarm, "cleanup_merged_prs") as cleanup_merged_prs,
        ):
            swarm.process_polling_cycle(initial=True)

        log_open_items.assert_called_once_with(issues, prs)
        process_issues.assert_called_once_with(
            False,
            open_issues=issues,
            open_prs=prs,
        )
        process_prs.assert_called_once_with(False, prs)
        cleanup_merged_prs.assert_called_once_with(False)

    def test_critical_gh_failure_is_reported_and_raised(self):
        result = SimpleNamespace(returncode=1, stdout="", stderr="auth failed")
        with (
            patch.object(swarm.subprocess, "run", return_value=result),
            self.assertLogs("swarm", level="ERROR") as captured,
            self.assertRaises(swarm.subprocess.CalledProcessError),
        ):
            swarm.gh(["issue", "list"])

        self.assertIn("auth failed", "\n".join(captured.output))


class DispatchSafetyTests(unittest.TestCase):
    def test_worker_dry_run_does_not_create_worktree(self):
        issue = swarm.TaskIssue(
            number=7,
            title="[Task] JSON - formatter",
            body="Implement it.",
            worker=swarm.RoleAssignment("codex", "5.6 sol", "높음"),
        )
        with (
            patch.object(swarm, "create_worktree") as create_worktree,
            patch.object(swarm, "write_prompt_file", return_value=Path("prompt")),
            patch.object(swarm, "build_ai_argv", return_value=["codex", "exec"]),
        ):
            swarm.dispatch_worker(issue, dry_run=True)

        create_worktree.assert_not_called()

    def test_worker_revision_dry_run_does_not_create_worktree(self):
        issue = swarm.TaskIssue(
            number=7,
            title="[Task] JSON - formatter",
            body="Implement it.",
            worker=swarm.RoleAssignment("codex", "5.6 sol", "높음"),
        )
        pr = swarm.TaskPR(
            number=12,
            title="[PR] 7 - formatter",
            body="",
            head_branch="worker/7-codex-formatter",
        )
        with (
            patch.object(swarm, "create_worktree") as create_worktree,
            patch.object(swarm, "write_prompt_file", return_value=Path("prompt")),
            patch.object(swarm, "build_ai_argv", return_value=["codex", "exec"]),
        ):
            swarm.dispatch_worker_revision(
                pr,
                issue,
                "Fix it.",
                dry_run=True,
            )

        create_worktree.assert_not_called()

    def test_maintainer_prompt_recovers_draft_pr_before_merge(self):
        pr = swarm.TaskPR(
            number=12,
            title="[PR] 7 - formatter",
            body="",
            head_branch="worker/7-codex-formatter",
        )
        maintainer = swarm.RoleAssignment("claude", "sonnet 5", "높음")
        with (
            patch.object(swarm, "write_prompt_file", return_value=Path("prompt")) as write_prompt,
            patch.object(swarm, "build_ai_argv", return_value=["claude"]),
        ):
            swarm.dispatch_maintainer(
                pr,
                issue=None,
                maintainer=maintainer,
                dry_run=True,
            )

        prompt = write_prompt.call_args.args[0]
        draft_check = "gh pr view 12 --json isDraft"
        mark_ready = "gh pr ready 12"
        reverify = "re-verify `mergeStateStatus` and CI before merging"
        merge = "Merge PR #12 after these checks"
        self.assertIn("not a '[Maintainer Blocked]' condition", prompt)
        self.assertLess(prompt.index(draft_check), prompt.index(mark_ready))
        self.assertLess(prompt.index(mark_ready), prompt.index(reverify))
        self.assertLess(prompt.index(reverify), prompt.index(merge))


class PollingLifecycleTests(unittest.TestCase):
    def setUp(self):
        self.issue = {
            "number": 7,
            "title": "[Task] JSON - improve formatter",
            "body": "[Worker: codex | Model: 5.6 sol | Reasoning: 높음]",
        }
        self.pr = {
            "number": 12,
            "title": "[PR] 7 - improve formatter",
            "body": (
                "[Reviewer: antigravity | Model: gemini 3.6 flash | "
                "Reasoning: high]"
            ),
            "headRefName": "worker/7-codex-json",
            "headRefOid": "abc123",
        }

    def test_successful_worker_is_not_retried_when_pr_signal_is_missing(self):
        tracker = FakeTracker({("issue#7:initial", "worker")})
        with (
            patch.object(swarm, "tracker", tracker),
            patch.object(swarm, "fetch_open_issues", return_value=[self.issue]),
            patch.object(swarm, "dispatch_worker") as dispatch_worker,
        ):
            swarm.process_issues(open_prs=[])

        dispatch_worker.assert_not_called()

    def test_worker_is_not_retried_after_pr_appears(self):
        tracker = FakeTracker({("issue#7:initial", "worker")})
        with (
            patch.object(swarm, "tracker", tracker),
            patch.object(swarm, "fetch_open_issues", return_value=[self.issue]),
            patch.object(swarm, "dispatch_worker") as dispatch_worker,
        ):
            swarm.process_issues(open_prs=[self.pr])

        dispatch_worker.assert_not_called()

    def test_initial_review_is_keyed_by_head_sha(self):
        tracker = FakeTracker()
        with (
            patch.object(swarm, "tracker", tracker),
            patch.object(swarm, "fetch_pr_comments", return_value=[]),
            patch.object(swarm, "fetch_issue", return_value=self.issue),
            patch.object(swarm, "dispatch_reviewer") as dispatch_reviewer,
        ):
            swarm.process_prs(open_prs=[self.pr])

        self.assertEqual(
            "review#12-abc123",
            dispatch_reviewer.call_args.kwargs["task_ref"],
        )

    def test_successful_reviewer_is_not_retried_without_new_signal(self):
        tracker = FakeTracker({("review#12-abc123", "reviewer")})
        with (
            patch.object(swarm, "tracker", tracker),
            patch.object(swarm, "fetch_pr_comments", return_value=[]),
            patch.object(swarm, "fetch_issue", return_value=self.issue),
            patch.object(swarm, "dispatch_reviewer") as dispatch_reviewer,
        ):
            swarm.process_prs(open_prs=[self.pr])

        dispatch_reviewer.assert_not_called()

    def test_reviewer_feedback_dispatches_original_worker_once(self):
        feedback = {
            "id": "feedback-42",
            "body": (
                "[Reviewer: antigravity | Model: gemini 3.6 flash | "
                "Reasoning: high]\nFix the stale read."
            ),
        }
        tracker = FakeTracker()
        with (
            patch.object(swarm, "tracker", tracker),
            patch.object(swarm, "fetch_pr_comments", return_value=[feedback]),
            patch.object(swarm, "fetch_issue", return_value=self.issue),
            patch.object(swarm, "dispatch_worker_revision") as dispatch_revision,
        ):
            swarm.process_prs(open_prs=[self.pr])

        self.assertEqual(
            "revise#12-feedback-42",
            dispatch_revision.call_args.kwargs["task_ref"],
        )

    def test_worker_signal_dispatches_reviewer_for_new_commit(self):
        revised_pr = {**self.pr, "headRefOid": "def456"}
        comments = [
            {
                "id": "feedback-42",
                "body": (
                    "[Reviewer: antigravity | Model: gemini 3.6 flash | "
                    "Reasoning: high]\nFix the stale read."
                ),
            },
            {"id": "worker-42", "body": "[Worker] Revision complete."},
        ]
        tracker = FakeTracker()
        with (
            patch.object(swarm, "tracker", tracker),
            patch.object(swarm, "fetch_pr_comments", return_value=comments),
            patch.object(swarm, "fetch_issue", return_value=self.issue),
            patch.object(swarm, "dispatch_reviewer") as dispatch_reviewer,
        ):
            swarm.process_prs(open_prs=[revised_pr])

        self.assertEqual(
            "review#12-def456",
            dispatch_reviewer.call_args.kwargs["task_ref"],
        )

    def test_approval_dispatches_distinct_ai3_once(self):
        approval = {
            "id": "approval-9",
            "body": (
                "[Reviewer: antigravity | Model: gemini 3.6 flash | "
                "Reasoning: high]\n"
                "[Maintainer: claude | Model: sonnet 5 | Reasoning: 높음]"
            ),
        }
        tracker = FakeTracker()
        with (
            patch.object(swarm, "tracker", tracker),
            patch.object(swarm, "fetch_pr_comments", return_value=[approval]),
            patch.object(swarm, "fetch_issue", return_value=self.issue),
            patch.object(swarm, "dispatch_maintainer") as dispatch_maintainer,
        ):
            swarm.process_prs(open_prs=[self.pr])

        self.assertEqual(
            "maintain#12-approval-9",
            dispatch_maintainer.call_args.kwargs["task_ref"],
        )

    def test_completed_maintainer_is_not_retried_when_pr_remains_open(self):
        approval = {
            "id": "approval-9",
            "body": (
                "[Reviewer: antigravity | Model: gemini 3.6 flash | "
                "Reasoning: high]\n"
                "[Maintainer: claude | Model: sonnet 5 | Reasoning: 높음]"
            ),
        }
        tracker = make_tracker([
            record(
                "maintain#12-approval-9",
                "maintainer",
                swarm.ProcessStatus.COMPLETED,
                ai_name="claude",
            ),
        ])
        with (
            patch.object(swarm, "tracker", tracker),
            patch.object(swarm, "fetch_pr_comments", return_value=[approval]),
            patch.object(swarm, "fetch_issue", return_value=self.issue),
            patch.object(swarm, "dispatch_maintainer") as dispatch_maintainer,
        ):
            swarm.process_prs(open_prs=[self.pr])

        dispatch_maintainer.assert_not_called()

    def test_maintainer_block_dispatches_reviewer_with_a_comment_key(self):
        maintainer_block = {
            "id": "maintainer-block-9",
            "body": (
                "[Maintainer: claude | Model: sonnet 5 | Reasoning: 높음]\n"
                "[Maintainer Blocked]\n"
                "Classification: test. Evidence: npm test fails."
            ),
        }
        tracker = FakeTracker({("review#12-abc123", "reviewer")})
        with (
            patch.object(swarm, "tracker", tracker),
            patch.object(swarm, "fetch_pr_comments", return_value=[maintainer_block]),
            patch.object(swarm, "fetch_issue", return_value=self.issue),
            patch.object(swarm, "dispatch_reviewer") as dispatch_reviewer,
        ):
            swarm.process_prs(open_prs=[self.pr])

        self.assertEqual(
            "review#12-maintainer-block-maintainer-block-9",
            dispatch_reviewer.call_args.kwargs["task_ref"],
        )
        self.assertEqual(
            "maintainer_block",
            dispatch_reviewer.call_args.kwargs["trigger"],
        )

    def test_completed_maintainer_block_review_is_not_retried(self):
        maintainer_block = {
            "id": "maintainer-block-9",
            "body": (
                "[Maintainer: claude | Model: sonnet 5 | Reasoning: 높음]\n"
                "[Maintainer Blocked]\n"
                "Classification: test. Evidence: npm test fails."
            ),
        }
        tracker = make_tracker([
            record(
                "review#12-maintainer-block-maintainer-block-9",
                "reviewer",
                swarm.ProcessStatus.COMPLETED,
                ai_name="antigravity",
            ),
        ])
        with (
            patch.object(swarm, "tracker", tracker),
            patch.object(swarm, "fetch_pr_comments", return_value=[maintainer_block]),
            patch.object(swarm, "fetch_issue", return_value=self.issue),
            patch.object(swarm, "dispatch_reviewer") as dispatch_reviewer,
        ):
            swarm.process_prs(open_prs=[self.pr])

        dispatch_reviewer.assert_not_called()

    def test_same_ai_worker_and_reviewer_blocks_dispatch(self):
        invalid_pr = {
            **self.pr,
            "body": "[Reviewer: codex | Model: 5.6 terra | Reasoning: 높음]",
        }
        tracker = FakeTracker()
        with (
            patch.object(swarm, "tracker", tracker),
            patch.object(swarm, "fetch_pr_comments", return_value=[]),
            patch.object(swarm, "fetch_issue", return_value=self.issue),
            patch.object(swarm, "dispatch_reviewer") as dispatch_reviewer,
        ):
            swarm.process_prs(open_prs=[invalid_pr])

        dispatch_reviewer.assert_not_called()

    def test_stray_maintainer_mention_does_not_freeze_the_pr(self):
        chatter = {
            "id": "human-7",
            "body": "Once approved, [Maintainer: claude | Model: sonnet 5 | Reasoning: 높음] merges.",
        }
        tracker = FakeTracker()
        with (
            patch.object(swarm, "tracker", tracker),
            patch.object(swarm, "fetch_pr_comments", return_value=[chatter]),
            patch.object(swarm, "fetch_issue", return_value=self.issue),
            patch.object(swarm, "dispatch_maintainer") as dispatch_maintainer,
            patch.object(swarm, "dispatch_reviewer") as dispatch_reviewer,
        ):
            swarm.process_prs(open_prs=[self.pr])

        dispatch_maintainer.assert_not_called()
        self.assertEqual(
            "review#12-abc123",
            dispatch_reviewer.call_args.kwargs["task_ref"],
        )

    def test_pr_without_issue_number_is_skipped_when_also_missing_reviewer(self):
        """A PR with neither an issue number nor a Reviewer tag is rejected."""
        no_reviewer_pr = {
            **self.pr,
            "title": "[PR] fix things",
            "body": "Some description without any role tags.",
        }
        tracker = FakeTracker()
        with (
            patch.object(swarm, "tracker", tracker),
            patch.object(swarm, "fetch_pr_comments") as fetch_comments,
            patch.object(swarm, "fetch_issue") as fetch_issue,
            patch.object(swarm, "dispatch_reviewer") as dispatch_reviewer,
        ):
            swarm.process_prs(open_prs=[no_reviewer_pr])

        fetch_comments.assert_not_called()
        fetch_issue.assert_not_called()
        dispatch_reviewer.assert_not_called()

    def test_pr_without_issue_number_dispatches_reviewer_when_tag_present(self):
        """A PR with no issue number but a Reviewer tag is still routed to review."""
        issueless_pr = {
            **self.pr,
            "title": "[PR] fix - handle edge case in formatter",
            "body": (
                "[Reviewer: antigravity | Model: gemini 3.6 flash | Reasoning: high]"
            ),
            "headRefOid": "sha999",
        }
        tracker = FakeTracker()
        with (
            patch.object(swarm, "tracker", tracker),
            patch.object(swarm, "fetch_pr_comments", return_value=[]),
            patch.object(swarm, "fetch_issue") as fetch_issue,
            patch.object(swarm, "dispatch_reviewer") as dispatch_reviewer,
        ):
            swarm.process_prs(open_prs=[issueless_pr])

        fetch_issue.assert_not_called()
        dispatch_reviewer.assert_called_once()

    def test_pr_without_issue_number_dispatches_maintainer_when_both_tags_present(self):
        """When an issueless PR approval comment carries both Reviewer and Maintainer tags, process_prs dispatches Maintainer."""
        issueless_pr = {
            "number": 12,
            "title": "[PR] fix - edge case with maintainer tag",
            "body": (
                "[Worker: codex | Model: 5.6 sol | Reasoning: 높음]\n"
                "[Reviewer: antigravity | Model: gemini 3.6 flash | Reasoning: high]"
            ),
            "headRefName": "fix-branch",
            "headRefOid": "sha555",
        }
        approval_comment = {
            "id": "c-approval-with-maintainer-tag",
            "body": (
                "[Reviewer: antigravity | Model: gemini 3.6 flash | Reasoning: high]\n"
                "[Maintainer: claude | Model: sonnet 5 | Reasoning: 높음]\n"
                "Implementation looks good, ready to merge."
            ),
        }
        tracker = FakeTracker()
        with (
            patch.object(swarm, "tracker", tracker),
            patch.object(swarm, "fetch_pr_comments", return_value=[approval_comment]),
            patch.object(swarm, "fetch_issue") as fetch_issue,
            patch.object(swarm, "dispatch_maintainer") as dispatch_maintainer,
        ):
            swarm.process_prs(open_prs=[issueless_pr])

        fetch_issue.assert_not_called()
        dispatch_maintainer.assert_called_once()
        maintainer_arg = dispatch_maintainer.call_args[0][2]
        assert maintainer_arg.ai == "claude"
        assert maintainer_arg.model == "sonnet 5"
        assert maintainer_arg.reasoning == "높음"

    def test_pr_without_issue_number_auto_selects_maintainer_on_approval(self):
        """When an issueless PR is approved without a Maintainer tag, process_prs auto-selects a Maintainer."""
        issueless_pr = {
            "number": 12,
            "title": "[PR] fix - edge case without maintainer tag",
            "body": (
                "[Worker: codex | Model: 5.6 terra | Reasoning: 높음]\n"
                "[Reviewer: antigravity | Model: gemini 3.6 flash | Reasoning: high]"
            ),
            "headRefName": "fix-branch",
            "headRefOid": "sha555",
        }
        approval_comment = {
            "id": "c-approval-no-maintainer-tag",
            "body": (
                "[Reviewer: antigravity | Model: gemini 3.6 flash | Reasoning: high]\n"
                "[Approved] Implementation looks good, ready to merge."
            ),
        }
        tracker = FakeTracker()
        with (
            patch.object(swarm, "tracker", tracker),
            patch.object(swarm, "fetch_pr_comments", return_value=[approval_comment]),
            patch.object(swarm, "fetch_issue") as fetch_issue,
            patch.object(swarm, "dispatch_maintainer") as dispatch_maintainer,
        ):
            swarm.process_prs(open_prs=[issueless_pr])

        fetch_issue.assert_not_called()
        dispatch_maintainer.assert_called_once()
        maintainer_arg = dispatch_maintainer.call_args[0][2]
        self.assertEqual("claude", maintainer_arg.ai)
        self.assertEqual("sonnet 5", maintainer_arg.model)
        self.assertEqual("high", maintainer_arg.reasoning)

    def test_select_maintainer_excludes_reviewer_and_worker(self):
        reviewer = swarm.RoleAssignment("antigravity", "gemini 3.6 flash", "high")
        worker = swarm.RoleAssignment("codex", "5.6 terra", "높음")
        maintainer = swarm.select_maintainer_for_issueless_pr(reviewer, worker)
        self.assertEqual("claude", maintainer.ai)

    def test_select_maintainer_excludes_only_reviewer_when_no_worker(self):
        reviewer = swarm.RoleAssignment("antigravity", "gemini 3.6 flash", "high")
        maintainer = swarm.select_maintainer_for_issueless_pr(reviewer, None)
        self.assertEqual("codex", maintainer.ai)

    def test_reviewer_approval_phrase_without_maintainer_tag_returns_maintain(self):
        """A Reviewer comment with [Approved] or LGTM without [Maintainer] metadata returns maintain action."""
        comments = [{
            "id": "c-approved-no-maintainer",
            "body": (
                "[Reviewer: antigravity | Model: gemini 3.6 flash | Reasoning: high]\n"
                "[Approved] Looks great to me, LGTM!"
            ),
        }]
        action, comment, _ = swarm.determine_pr_action(comments)
        self.assertEqual("maintain", action)
        self.assertEqual("c-approved-no-maintainer", comment["id"])

    def test_pr_without_issue_number_dispatches_worker_revision_using_pr_body_worker(self):
        """Issueless PR with Worker in PR body dispatches worker revision on Reviewer feedback comment."""
        issueless_pr = {
            "number": 14,
            "title": "[PR] standalone feature",
            "body": (
                "[Worker: codex | Model: 5.6 terra | Reasoning: 높음]\n"
                "[Reviewer: antigravity | Model: gemini 3.6 flash | Reasoning: high]"
            ),
            "headRefName": "feat-branch",
            "headRefOid": "sha888",
        }
        feedback_comment = {
            "id": "c-feedback-1",
            "body": (
                "[Reviewer: antigravity | Model: gemini 3.6 flash | Reasoning: high]\n"
                "Please fix the edge case in parser."
            ),
        }
        tracker = FakeTracker()
        with (
            patch.object(swarm, "tracker", tracker),
            patch.object(swarm, "fetch_pr_comments", return_value=[feedback_comment]),
            patch.object(swarm, "fetch_issue") as fetch_issue,
            patch.object(swarm, "dispatch_worker_revision") as dispatch_worker_revision,
        ):
            swarm.process_prs(open_prs=[issueless_pr])

        fetch_issue.assert_not_called()
        dispatch_worker_revision.assert_called_once()
        worker_arg = dispatch_worker_revision.call_args[1].get("worker") or dispatch_worker_revision.call_args[0][5]
        assert worker_arg.ai == "codex"


    def test_feedback_from_unassigned_reviewer_is_ignored(self):
        feedback = {
            "id": "feedback-wrong-reviewer",
            "body": (
                "[Reviewer: claude | Model: sonnet 5 | Reasoning: 높음]\n"
                "This signal does not belong to the assigned Reviewer."
            ),
        }
        tracker = FakeTracker()
        with (
            patch.object(swarm, "tracker", tracker),
            patch.object(swarm, "fetch_pr_comments", return_value=[feedback]),
            patch.object(swarm, "fetch_issue", return_value=self.issue),
            patch.object(swarm, "dispatch_worker_revision") as dispatch_revision,
        ):
            swarm.process_prs(open_prs=[self.pr])

        dispatch_revision.assert_not_called()

    def test_issue_backed_pr_approval_without_maintainer_tag_blocks_dispatch(self):
        """Issue-backed PR approved without Maintainer tag must not auto-select Maintainer and must not dispatch."""
        issue_backed_pr = {
            "number": 20,
            "title": "[PR] 12 - Add feature",
            "body": "[Reviewer: antigravity | Model: gemini 3.6 flash | Reasoning: high]",
            "headRefName": "worker/12-codex-feat",
            "headRefOid": "sha123",
        }
        approval_comment = {
            "id": "c-approved-no-maintainer-tag",
            "body": (
                "[Reviewer: antigravity | Model: gemini 3.6 flash | Reasoning: high]\n"
                "[Approved] Looks great to me, LGTM!"
            ),
        }
        tracker = FakeTracker()
        with (
            patch.object(swarm, "tracker", tracker),
            patch.object(swarm, "fetch_pr_comments", return_value=[approval_comment]),
            patch.object(swarm, "fetch_issue", return_value=self.issue),
            patch.object(swarm, "dispatch_maintainer") as dispatch_maintainer,
        ):
            swarm.process_prs(open_prs=[issue_backed_pr])

        dispatch_maintainer.assert_not_called()

    def test_issueless_pr_approval_without_maintainer_tag_dispatches_auto_selected_maintainer(self):
        """Issueless PR approved without Maintainer tag auto-selects Maintainer and dispatches."""
        issueless_pr = {
            "number": 21,
            "title": "[PR] standalone feature",
            "body": (
                "[Worker: codex | Model: 5.6 terra | Reasoning: 높음]\n"
                "[Reviewer: antigravity | Model: gemini 3.6 flash | Reasoning: high]"
            ),
            "headRefName": "feat-branch",
            "headRefOid": "sha999",
        }
        approval_comment = {
            "id": "c-approved-issueless",
            "body": (
                "[Reviewer: antigravity | Model: gemini 3.6 flash | Reasoning: high]\n"
                "[Approved] LGTM!"
            ),
        }
        tracker = FakeTracker()
        with (
            patch.object(swarm, "tracker", tracker),
            patch.object(swarm, "fetch_pr_comments", return_value=[approval_comment]),
            patch.object(swarm, "fetch_issue") as fetch_issue,
            patch.object(swarm, "dispatch_maintainer") as dispatch_maintainer,
        ):
            swarm.process_prs(open_prs=[issueless_pr])

        fetch_issue.assert_not_called()
        dispatch_maintainer.assert_called_once()
        maintainer_arg = dispatch_maintainer.call_args[1].get("maintainer") or dispatch_maintainer.call_args[0][2]
        self.assertEqual("claude", maintainer_arg.ai)

    def test_issue_backed_pr_negative_lgtm_dispatches_worker_revision(self):
        """Issue-backed PR with 'Not LGTM: regression remains.' comment must dispatch Worker revision."""
        issue_backed_pr = {
            "number": 22,
            "title": "[PR] 12 - Add feature",
            "body": (
                "[Worker: codex | Model: 5.6 terra | Reasoning: 높음]\n"
                "[Reviewer: antigravity | Model: gemini 3.6 flash | Reasoning: high]"
            ),
            "headRefName": "worker/12-codex-feat",
            "headRefOid": "sha123",
        }
        negative_comment = {
            "id": "c-not-lgtm-issue-backed",
            "body": (
                "[Reviewer: antigravity | Model: gemini 3.6 flash | Reasoning: high]\n"
                "Not LGTM: regression remains."
            ),
        }
        tracker = FakeTracker()
        with (
            patch.object(swarm, "tracker", tracker),
            patch.object(swarm, "fetch_pr_comments", return_value=[negative_comment]),
            patch.object(swarm, "fetch_issue", return_value=self.issue),
            patch.object(swarm, "dispatch_maintainer") as dispatch_maintainer,
            patch.object(swarm, "dispatch_worker_revision") as dispatch_worker_revision,
        ):
            swarm.process_prs(open_prs=[issue_backed_pr])

        dispatch_maintainer.assert_not_called()
        dispatch_worker_revision.assert_called_once()

    def test_issueless_pr_negative_lgtm_dispatches_worker_revision(self):
        """Issueless PR with 'Not LGTM: regression remains.' comment must dispatch Worker revision, not Maintainer."""
        issueless_pr = {
            "number": 23,
            "title": "[PR] standalone feature",
            "body": (
                "[Worker: codex | Model: 5.6 terra | Reasoning: 높음]\n"
                "[Reviewer: antigravity | Model: gemini 3.6 flash | Reasoning: high]"
            ),
            "headRefName": "feat-branch",
            "headRefOid": "sha999",
        }
        negative_comment = {
            "id": "c-not-lgtm-issueless",
            "body": (
                "[Reviewer: antigravity | Model: gemini 3.6 flash | Reasoning: high]\n"
                "Not LGTM: regression remains."
            ),
        }
        tracker = FakeTracker()
        with (
            patch.object(swarm, "tracker", tracker),
            patch.object(swarm, "fetch_pr_comments", return_value=[negative_comment]),
            patch.object(swarm, "dispatch_maintainer") as dispatch_maintainer,
            patch.object(swarm, "dispatch_worker_revision") as dispatch_worker_revision,
        ):
            swarm.process_prs(open_prs=[issueless_pr])

        dispatch_maintainer.assert_not_called()
        dispatch_worker_revision.assert_called_once()

    def test_issueless_pr_conditional_feedback_dispatches_worker_revision(self):
        """Issueless PR receiving 'Changes are still required; LGTM after...' must dispatch Worker revision, not Maintainer."""
        issueless_pr = {
            "number": 24,
            "title": "[PR] standalone feature",
            "body": (
                "[Worker: codex | Model: 5.6 terra | Reasoning: 높음]\n"
                "[Reviewer: antigravity | Model: gemini 3.6 flash | Reasoning: high]"
            ),
            "headRefName": "feat-branch",
            "headRefOid": "sha100",
        }
        conditional_comment = {
            "id": "c-conditional-issueless",
            "body": (
                "[Reviewer: antigravity | Model: gemini 3.6 flash | Reasoning: high]\n"
                "Changes are still required; LGTM after the regression test is added."
            ),
        }
        tracker = FakeTracker()
        with (
            patch.object(swarm, "tracker", tracker),
            patch.object(swarm, "fetch_pr_comments", return_value=[conditional_comment]),
            patch.object(swarm, "dispatch_maintainer") as dispatch_maintainer,
            patch.object(swarm, "dispatch_worker_revision") as dispatch_worker_revision,
        ):
            swarm.process_prs(open_prs=[issueless_pr])

        dispatch_maintainer.assert_not_called()
        dispatch_worker_revision.assert_called_once()

    def test_issueless_pr_genuine_approval_auto_selects_maintainer(self):
        """Issueless PR with genuine [Approved] tag must auto-select Maintainer and dispatch Maintainer."""
        issueless_pr = {
            "number": 25,
            "title": "[PR] standalone feature",
            "body": (
                "[Worker: codex | Model: 5.6 terra | Reasoning: 높음]\n"
                "[Reviewer: antigravity | Model: gemini 3.6 flash | Reasoning: high]"
            ),
            "headRefName": "feat-branch",
            "headRefOid": "sha101",
        }
        approval_comment = {
            "id": "c-approval-issueless",
            "body": (
                "[Reviewer: antigravity | Model: gemini 3.6 flash | Reasoning: high]\n"
                "[Approved] Looks great to me, LGTM!"
            ),
        }
        tracker = FakeTracker()
        with (
            patch.object(swarm, "tracker", tracker),
            patch.object(swarm, "fetch_pr_comments", return_value=[approval_comment]),
            patch.object(swarm, "dispatch_maintainer") as dispatch_maintainer,
            patch.object(swarm, "dispatch_worker_revision") as dispatch_worker_revision,
        ):
            swarm.process_prs(open_prs=[issueless_pr])

        dispatch_worker_revision.assert_not_called()
        dispatch_maintainer.assert_called_once()
        maintainer_arg = dispatch_maintainer.call_args[1].get("maintainer") or dispatch_maintainer.call_args[0][2]
        self.assertEqual("claude", maintainer_arg.ai)


class CreateWorktreeTests(unittest.TestCase):
    def test_find_worktree_for_branch_parses_porcelain(self):
        porcelain_output = (
            "worktree /repo/root\n"
            "HEAD abc1234\n"
            "branch refs/heads/main\n\n"
            "worktree /repo/.worktrees/156\n"
            "HEAD def5678\n"
            "branch refs/heads/worker/156-branch\n\n"
        )
        fake_res = subprocess.CompletedProcess(
            args=["git", "worktree", "list", "--porcelain"],
            returncode=0,
            stdout=porcelain_output,
            stderr="",
        )
        with patch.object(swarm.subprocess, "run", return_value=fake_res):
            found = swarm.find_worktree_for_branch("worker/156-branch")
            self.assertEqual(found, Path("/repo/.worktrees/156"))

            not_found = swarm.find_worktree_for_branch("worker/nonexistent")
            self.assertIsNone(not_found)

    def test_create_worktree_creates_new_without_force(self):
        tmp_dir = Path(tempfile.mkdtemp())
        target_path = tmp_dir / "156"
        with (
            patch.object(swarm, "WORKTREE_DIR", tmp_dir),
            patch.object(swarm, "find_worktree_for_branch", return_value=None),
            patch.object(swarm, "local_branch_exists", return_value=False),
            patch.object(swarm.subprocess, "run") as run,
        ):
            wt = swarm.create_worktree(156, "worker/156-branch")
            self.assertEqual(wt, target_path)
            run.assert_any_call(["git", "worktree", "prune"], cwd=swarm.REPO_ROOT, check=False)
            run.assert_any_call(["git", "branch", "worker/156-branch"], cwd=swarm.REPO_ROOT, check=True)
            run.assert_any_call(
                ["git", "worktree", "add", str(target_path), "worker/156-branch"],
                cwd=swarm.REPO_ROOT,
                check=True,
            )

    def test_create_worktree_reuses_existing_worktree_for_branch(self):
        tmp_dir = Path(tempfile.mkdtemp())
        existing_path = tmp_dir / "existing_156"
        existing_path.mkdir(parents=True)
        (existing_path / ".git").write_text("gitdir: ...")
        with (
            patch.object(swarm, "WORKTREE_DIR", tmp_dir),
            patch.object(swarm, "find_worktree_for_branch", return_value=existing_path),
            patch.object(swarm.subprocess, "run") as run,
        ):
            wt = swarm.create_worktree(156, "worker/156-branch")
            self.assertEqual(wt, existing_path)
            # Should not attempt to add another worktree for the same branch
            for call in run.call_args_list:
                args = call[0][0]
                self.assertNotIn("add", args)

    def test_create_worktree_already_checked_out_branch_porcelain_no_git_add(self):
        tmp_dir = Path(tempfile.mkdtemp())
        existing_path = tmp_dir / "existing_worktree"
        existing_path.mkdir(parents=True)
        (existing_path / ".git").write_text("gitdir: ...")

        porcelain_output = (
            f"worktree {existing_path}\n"
            "HEAD def5678\n"
            "branch refs/heads/worker/239-branch\n\n"
        )

        def fake_run(cmd, **kwargs):
            if cmd[:3] == ["git", "worktree", "list"]:
                return subprocess.CompletedProcess(
                    args=cmd, returncode=0, stdout=porcelain_output, stderr=""
                )
            return subprocess.CompletedProcess(args=cmd, returncode=0, stdout="", stderr="")

        with (
            patch.object(swarm, "WORKTREE_DIR", tmp_dir),
            patch.object(swarm.subprocess, "run", side_effect=fake_run) as mock_run,
        ):
            wt = swarm.create_worktree(239, "worker/239-branch")
            self.assertEqual(wt, existing_path)
            for call in mock_run.call_args_list:
                args = call[0][0]
                self.assertNotIn("branch", args)
                self.assertNotIn("add", args)

    def test_create_worktree_returns_existing_valid_worktree(self):
        tmp_dir = Path(tempfile.mkdtemp())
        target_path = tmp_dir / "156"
        target_path.mkdir(parents=True)
        (target_path / ".git").write_text("gitdir: ...")
        with (
            patch.object(swarm, "WORKTREE_DIR", tmp_dir),
            patch.object(swarm.subprocess, "run") as run,
        ):
            wt = swarm.create_worktree(156, "worker/156-branch")
            self.assertEqual(wt, target_path)
            run.assert_not_called()

    def test_create_worktree_repairs_broken_git_link(self):
        tmp_dir = Path(tempfile.mkdtemp())
        target_path = tmp_dir / "156"
        target_path.mkdir(parents=True)
        (target_path / "important.txt").write_text("user changes")

        def fake_run(args, cwd=None, check=False, capture_output=False, text=False):
            if args[:3] == ["git", "worktree", "repair"]:
                # Simulate repair restoring .git file
                (target_path / ".git").write_text("gitdir: ...")
            return subprocess.CompletedProcess(args=args, returncode=0, stdout="", stderr="")

        with (
            patch.object(swarm, "WORKTREE_DIR", tmp_dir),
            patch.object(swarm.subprocess, "run", side_effect=fake_run),
        ):
            wt = swarm.create_worktree(156, "worker/156-branch")
            self.assertEqual(wt, target_path)
            self.assertTrue((target_path / "important.txt").exists())
            self.assertTrue((target_path / ".git").exists())

    def test_create_worktree_blocks_and_preserves_non_empty_unlinked_dir(self):
        tmp_dir = Path(tempfile.mkdtemp())
        target_path = tmp_dir / "156"
        target_path.mkdir(parents=True)
        (target_path / "uncommitted_code.py").write_text("def work(): pass")
        with (
            patch.object(swarm, "WORKTREE_DIR", tmp_dir),
            patch.object(swarm, "log_blocker") as log_blocker,
            patch.object(swarm.subprocess, "run") as run,
        ):
            wt = swarm.create_worktree(156, "worker/156-branch")
            self.assertIsNone(wt)
            # Files must NOT be deleted
            self.assertTrue((target_path / "uncommitted_code.py").exists())
            log_blocker.assert_called_once()

    def test_create_worktree_cleans_empty_broken_directory(self):
        tmp_dir = Path(tempfile.mkdtemp())
        target_path = tmp_dir / "156"
        target_path.mkdir(parents=True)
        with (
            patch.object(swarm, "WORKTREE_DIR", tmp_dir),
            patch.object(swarm, "find_worktree_for_branch", return_value=None),
            patch.object(swarm, "local_branch_exists", return_value=True),
            patch.object(swarm.subprocess, "run") as run,
        ):
            wt = swarm.create_worktree(156, "worker/156-branch")
            self.assertEqual(wt, target_path)
            run.assert_any_call(
                ["git", "worktree", "add", str(target_path), "worker/156-branch"],
                cwd=swarm.REPO_ROOT,
                check=True,
            )


def _porcelain_output(entries):
    """Build fake `git worktree list --porcelain` output.

    `entries` is a list of (path, branch_ref_or_None) tuples; branch=None
    produces a `detached` stanza instead of a `branch` line.
    """
    lines = []
    for path, branch in entries:
        lines.append(f"worktree {path}")
        lines.append("HEAD abcdef1234567890abcdef1234567890abcdef12")
        if branch:
            lines.append(f"branch {branch}")
        else:
            lines.append("detached")
        lines.append("")
    return "\n".join(lines) + ("\n" if lines else "")


class ListWorktreesTests(unittest.TestCase):
    def test_parses_multiple_stanzas_including_detached(self):
        output = _porcelain_output([
            ("/repo/root", "refs/heads/main"),
            ("/repo/.worktrees/9", "refs/heads/worker/9-codex-x"),
            ("/repo/.worktrees/scratch", None),
        ])
        fake_res = subprocess.CompletedProcess(
            args=["git", "worktree", "list", "--porcelain"],
            returncode=0, stdout=output, stderr="",
        )
        with patch.object(swarm.subprocess, "run", return_value=fake_res):
            entries = swarm._list_worktrees()

        self.assertEqual(
            entries,
            [
                {"path": "/repo/root", "branch": "refs/heads/main"},
                {"path": "/repo/.worktrees/9", "branch": "refs/heads/worker/9-codex-x"},
                {"path": "/repo/.worktrees/scratch", "branch": None},
            ],
        )

    def test_returns_empty_list_on_git_failure(self):
        fake_res = subprocess.CompletedProcess(
            args=["git", "worktree", "list", "--porcelain"],
            returncode=1, stdout="", stderr="fatal: not a git repository",
        )
        with patch.object(swarm.subprocess, "run", return_value=fake_res):
            self.assertEqual(swarm._list_worktrees(), [])


class CleanupTests(unittest.TestCase):
    def test_cleanup_is_a_no_op_when_nothing_remains(self):
        with (
            patch.object(swarm, "WORKTREE_DIR", Path(tempfile.mkdtemp())),
            patch.object(swarm, "local_branch_exists", return_value=False),
            patch.object(swarm.subprocess, "run") as run,
        ):
            swarm.cleanup_worktree(7, "worker/7-codex-json")

        run.assert_not_called()

    def test_worktree_cleanup_survives_a_failed_issue_lookup(self):
        merged = '[{"number": 12, "title": "[PR] 7 - improve formatter", ' \
                 '"headRefName": "worker/7-codex-json"}]'

        def fake_gh(args, check=True):
            if args[0] == "pr":
                return merged
            return ""  # `gh issue view` failed

        with (
            patch.object(swarm, "gh", side_effect=fake_gh),
            patch.object(swarm, "cleanup_worktree") as cleanup_worktree,
        ):
            swarm.cleanup_merged_prs(dry_run=False)

        cleanup_worktree.assert_called_once_with(7, "worker/7-codex-json")

    def test_cleanup_removes_reused_non_canonical_registered_worktree(self):
        """Branch checked out outside `.worktrees/<issue>` (see create_worktree's
        reuse path) must still be found, removed, and its branch deleted."""
        tmp_dir = Path(tempfile.mkdtemp())
        worktree_dir = tmp_dir / ".worktrees"  # canonical `9` dir never created
        reused_path = tmp_dir / "elsewhere" / "9-reused"
        reused_path.mkdir(parents=True)
        (reused_path / ".git").write_text("gitdir: ...")
        branch = "worker/9-codex-feature"

        porcelain_output = _porcelain_output([
            (str(tmp_dir), "refs/heads/main"),
            (str(reused_path), f"refs/heads/{branch}"),
        ])
        calls = []

        def fake_run(args, **kwargs):
            calls.append((args, kwargs.get("cwd")))
            if args[:4] == ["git", "worktree", "list", "--porcelain"]:
                return subprocess.CompletedProcess(args, 0, porcelain_output, "")
            if args[:2] == ["git", "status"]:
                return subprocess.CompletedProcess(args, 0, "", "")  # clean
            return subprocess.CompletedProcess(args, 0, "", "")

        with (
            patch.object(swarm, "WORKTREE_DIR", worktree_dir),
            patch.object(swarm, "REPO_ROOT", tmp_dir),
            patch.object(swarm, "local_branch_exists", return_value=True),
            patch.object(swarm.subprocess, "run", side_effect=fake_run),
        ):
            swarm.cleanup_worktree(9, branch)

        self.assertIn((["git", "worktree", "remove", str(reused_path)], tmp_dir), calls)
        self.assertIn((["git", "branch", "-D", branch], tmp_dir), calls)

    def test_cleanup_prefers_canonical_worktree_when_it_matches_branch(self):
        """When the canonical path is a valid worktree for the branch, cleanup
        must use it directly and never consult the fallback resolver."""
        tmp_dir = Path(tempfile.mkdtemp())
        worktree_dir = tmp_dir / ".worktrees"
        canonical_path = worktree_dir / "9"
        canonical_path.mkdir(parents=True)
        (canonical_path / ".git").write_text("gitdir: ...")
        branch = "worker/9-codex-feature"

        porcelain_output = _porcelain_output([(str(canonical_path), f"refs/heads/{branch}")])
        calls = []

        def fake_run(args, **kwargs):
            calls.append((args, kwargs.get("cwd")))
            if args[:4] == ["git", "worktree", "list", "--porcelain"]:
                return subprocess.CompletedProcess(args, 0, porcelain_output, "")
            if args[:2] == ["git", "status"]:
                return subprocess.CompletedProcess(args, 0, "", "")  # clean
            return subprocess.CompletedProcess(args, 0, "", "")

        def fail_if_called(*_args, **_kwargs):
            raise AssertionError("fallback resolver must not run when canonical matches")

        with (
            patch.object(swarm, "WORKTREE_DIR", worktree_dir),
            patch.object(swarm, "REPO_ROOT", tmp_dir),
            patch.object(swarm, "find_worktree_for_branch", side_effect=fail_if_called),
            patch.object(swarm.subprocess, "run", side_effect=fake_run),
        ):
            swarm.cleanup_worktree(9, branch)

        self.assertIn((["git", "worktree", "remove", str(canonical_path)], tmp_dir), calls)
        self.assertIn((["git", "branch", "-D", branch], tmp_dir), calls)

    def test_cleanup_preserves_dirty_non_canonical_worktree(self):
        tmp_dir = Path(tempfile.mkdtemp())
        worktree_dir = tmp_dir / ".worktrees"
        reused_path = tmp_dir / "elsewhere" / "9-reused"
        reused_path.mkdir(parents=True)
        (reused_path / ".git").write_text("gitdir: ...")
        (reused_path / "wip.py").write_text("value = 1")
        branch = "worker/9-codex-feature"

        porcelain_output = _porcelain_output([(str(reused_path), f"refs/heads/{branch}")])
        calls = []

        def fake_run(args, **kwargs):
            calls.append((args, kwargs.get("cwd")))
            if args[:4] == ["git", "worktree", "list", "--porcelain"]:
                return subprocess.CompletedProcess(args, 0, porcelain_output, "")
            if args[:2] == ["git", "status"]:
                return subprocess.CompletedProcess(args, 0, " M wip.py\n", "")  # dirty
            return subprocess.CompletedProcess(args, 0, "", "")

        with (
            patch.object(swarm, "WORKTREE_DIR", worktree_dir),
            patch.object(swarm, "REPO_ROOT", tmp_dir),
            patch.object(swarm, "local_branch_exists", return_value=True),
            patch.object(swarm, "log_blocker") as log_blocker,
            patch.object(swarm.subprocess, "run", side_effect=fake_run),
        ):
            swarm.cleanup_worktree(9, branch)

        self.assertTrue((reused_path / "wip.py").exists())
        for args, _cwd in calls:
            self.assertNotEqual(args[:3], ["git", "worktree", "remove"])
            self.assertNotEqual(args[:3], ["git", "branch", "-D"])
        log_blocker.assert_called_once()
        self.assertTrue(log_blocker.call_args[0][0].startswith("dirty-worktree-fallback:"))

    def test_cleanup_does_not_delete_branch_when_canonical_removal_blocked(self):
        tmp_dir = Path(tempfile.mkdtemp())
        worktree_dir = tmp_dir / ".worktrees"
        canonical_path = worktree_dir / "9"
        canonical_path.mkdir(parents=True)
        (canonical_path / ".git").write_text("gitdir: ...")
        branch = "worker/9-codex-feature"
        calls = []

        def fake_run(args, **kwargs):
            calls.append(args)
            if args[:2] == ["git", "status"]:
                return subprocess.CompletedProcess(args, 0, " M dirty.py\n", "")
            return subprocess.CompletedProcess(args, 0, "", "")

        with (
            patch.object(swarm, "WORKTREE_DIR", worktree_dir),
            patch.object(swarm, "REPO_ROOT", tmp_dir),
            patch.object(swarm, "log_blocker") as log_blocker,
            patch.object(swarm.subprocess, "run", side_effect=fake_run),
        ):
            swarm.cleanup_worktree(9, branch)

        for args in calls:
            self.assertNotEqual(args[:3], ["git", "branch", "-D"])
        log_blocker.assert_called_once_with(
            "dirty-worktree:9",
            "Refusing to remove non-clean worktree for Issue #%d: %s",
            9,
            canonical_path,
            level=swarm.logging.WARNING,
        )


class RemoveFallbackWorktreeTests(unittest.TestCase):
    """Direct unit coverage for the non-canonical removal guardrails."""

    def test_never_removes_repository_root(self):
        with (
            patch.object(swarm, "_worktree_branch_for_path", return_value="refs/heads/worker/9-x"),
            patch.object(swarm, "log_blocker") as log_blocker,
            patch.object(swarm.subprocess, "run") as run,
        ):
            result = swarm._remove_fallback_worktree(9, "worker/9-x", swarm.REPO_ROOT)

        self.assertFalse(result)
        log_blocker.assert_called_once()
        self.assertTrue(log_blocker.call_args[0][0].startswith("cleanup-fallback-root:"))
        run.assert_not_called()

    def test_never_removes_a_path_git_does_not_report_as_registered(self):
        tmp_dir = Path(tempfile.mkdtemp())
        with (
            patch.object(swarm, "_worktree_branch_for_path", return_value=None),
            patch.object(swarm, "log_blocker") as log_blocker,
            patch.object(swarm.subprocess, "run") as run,
        ):
            result = swarm._remove_fallback_worktree(9, "worker/9-x", tmp_dir)

        self.assertFalse(result)
        log_blocker.assert_called_once()
        self.assertTrue(log_blocker.call_args[0][0].startswith("cleanup-fallback-unregistered:"))
        run.assert_not_called()

    def test_never_removes_missing_git_directory_with_files(self):
        tmp_dir = Path(tempfile.mkdtemp())
        target = tmp_dir / "reused"
        target.mkdir()
        (target / "work.py").write_text("value = 1")

        with (
            patch.object(swarm, "_worktree_branch_for_path", return_value="refs/heads/worker/9-x"),
            patch.object(swarm, "log_blocker") as log_blocker,
            patch.object(swarm.subprocess, "run") as run,
        ):
            result = swarm._remove_fallback_worktree(9, "worker/9-x", target)

        self.assertFalse(result)
        self.assertTrue((target / "work.py").exists())
        log_blocker.assert_called_once()
        self.assertTrue(log_blocker.call_args[0][0].startswith("cleanup-fallback-nogit:"))
        run.assert_not_called()

    def test_treats_a_registered_but_missing_directory_as_already_removed(self):
        tmp_dir = Path(tempfile.mkdtemp())
        missing = tmp_dir / "gone"
        with (
            patch.object(swarm, "_worktree_branch_for_path", return_value="refs/heads/worker/9-x"),
            patch.object(swarm.subprocess, "run") as run,
        ):
            result = swarm._remove_fallback_worktree(9, "worker/9-x", missing)

        self.assertTrue(result)
        run.assert_called_once_with(["git", "worktree", "prune"], cwd=swarm.REPO_ROOT, check=False)


class MainSyncRestartTests(unittest.TestCase):
    def test_successful_fast_forward_restarts_with_same_arguments(self):
        with (
            patch.object(
                swarm,
                "orchestrator_fingerprint",
                side_effect=["before", "after"],
            ),
            patch.object(swarm, "sync_main_branch", return_value=True),
            patch.object(swarm.os, "execv") as execv,
            patch.object(swarm.sys, "argv", ["orchestrator.py", "--interval", "15"]),
        ):
            swarm.sync_main_and_restart_if_updated()

        execv.assert_called_once_with(
            swarm.sys.executable,
            [swarm.sys.executable, "orchestrator.py", "--interval", "15"],
        )

    def test_active_process_defers_restart_until_activity_drains(self):
        tracker = SimpleNamespace(active_count=1, outstanding_count=1)
        with (
            patch.object(
                swarm,
                "orchestrator_fingerprint",
                side_effect=["before", "after"],
            ),
            patch.object(swarm, "sync_main_branch", return_value=True),
            patch.object(swarm, "tracker", tracker),
            patch.object(swarm.os, "execv") as execv,
        ):
            swarm.sync_main_and_restart_if_updated()

            execv.assert_not_called()
            self.assertTrue(swarm._restart_pending)

            tracker.active_count = 0
            tracker.outstanding_count = 0
            swarm.restart_if_pending()

        execv.assert_called_once()
        self.assertFalse(swarm._restart_pending)

    def test_dry_run_logs_restart_without_exec(self):
        with (
            patch.object(
                swarm,
                "orchestrator_fingerprint",
                side_effect=["before", "after"],
            ),
            patch.object(swarm, "sync_main_branch", return_value=True),
            patch.object(swarm.os, "execv") as execv,
            self.assertLogs("swarm", level="INFO") as captured,
        ):
            swarm.sync_main_and_restart_if_updated(dry_run=True)

        execv.assert_not_called()
        self.assertIn(
            "[DRY RUN] Would restart orchestrator",
            "\n".join(captured.output),
        )

    def test_no_fast_forward_does_not_compare_or_restart(self):
        with (
            patch.object(
                swarm,
                "orchestrator_fingerprint",
                return_value="unchanged",
            ) as fingerprint,
            patch.object(swarm, "sync_main_branch", return_value=False),
            patch.object(swarm.os, "execv") as execv,
        ):
            swarm.sync_main_and_restart_if_updated()

        fingerprint.assert_called_once_with()
        execv.assert_not_called()

    def test_fingerprint_failure_warns_and_skips_restart(self):
        missing_path = Path(tempfile.mkdtemp()) / "missing.py"
        with (
            patch.object(swarm, "ORCHESTRATOR_PATH", missing_path),
            self.assertLogs("swarm", level="WARNING") as captured,
        ):
            fingerprint = swarm.orchestrator_fingerprint()

        self.assertIsNone(fingerprint)
        self.assertIn("skipping automatic restart", "\n".join(captured.output))

    def test_once_path_syncs_without_restart_check(self):
        with (
            patch.object(swarm.sys, "argv", ["orchestrator.py", "--once"]),
            patch.object(swarm, "reset_process_history") as reset_history,
            patch.object(swarm, "cleanup_old_task_logs"),
            patch.object(swarm, "sync_main_branch") as sync_main_branch,
            patch.object(swarm, "sync_main_and_restart_if_updated") as restart_sync,
            patch.object(swarm, "process_polling_cycle"),
            patch.object(swarm.tracker, "poll_all"),
            patch.object(swarm, "cleanup_merged_prs"),
        ):
            swarm.main()

        sync_main_branch.assert_called_once_with(False)
        restart_sync.assert_not_called()
        reset_history.assert_called_once_with(preserve_running=False)

    def test_polling_daemon_preserves_running_history_on_startup(self):
        with (
            patch.object(swarm.sys, "argv", ["orchestrator.py", "--interval", "1"]),
            patch.object(swarm, "reset_process_history") as reset_history,
            patch.object(swarm, "cleanup_old_task_logs"),
            patch.object(swarm, "run_loop"),
        ):
            swarm.main()

            reset_history.assert_called_once_with(preserve_running=True)

    def test_dry_run_does_not_preserve_running_history_on_startup(self):
        with (
            patch.object(swarm.sys, "argv", ["orchestrator.py", "--dry-run"]),
            patch.object(swarm, "reset_process_history") as reset_history,
            patch.object(swarm, "cleanup_old_task_logs"),
            patch.object(swarm, "run_loop"),
        ):
            swarm.main()

            reset_history.assert_called_once_with(preserve_running=False)


class RuntimeLifecycleTests(unittest.TestCase):
    def test_reset_preserves_live_running_dispatch_across_once_invocations(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            registry = Path(tmp_dir) / "registry.json"
            log_file = Path(tmp_dir) / "child.log"
            log_file.write_text("", encoding="utf-8")
            proc = subprocess.Popen(
                [sys.executable, "-c", "import time; time.sleep(60)"],
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )

            try:
                original_tracker = make_tracker([])
                with patch.object(swarm, "PROCESS_REGISTRY_FILE", registry):
                    original_tracker.register(
                        proc=proc,
                        role="worker",
                        ai_name="codex",
                        model="5.6 sol",
                        reasoning="high",
                        task_ref="issue#231:initial",
                        branch="worker/231-codex-once-mode",
                        command="long-lived child",
                        cwd=tmp_dir,
                        log_file=str(log_file),
                    )
                    restarted_tracker = swarm.ProcessTracker()

                with (
                    patch.object(swarm, "tracker", restarted_tracker),
                    patch.object(swarm, "PROCESS_REGISTRY_FILE", registry),
                ):
                    swarm.reset_process_history(preserve_running=False)

                    self.assertEqual(1, len(restarted_tracker._history))
                    allowed, reason = restarted_tracker.should_dispatch(
                        "issue#231:initial",
                        "worker",
                    )
                    self.assertFalse(allowed)
                    self.assertEqual(swarm.DISPATCH_RUNNING, reason)
                    self.assertTrue(registry.exists())
            finally:
                proc.terminate()
                proc.wait(timeout=5)

    def test_reset_reclaims_running_dispatch_after_pid_dies(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            registry = Path(tmp_dir) / "registry.json"
            registry.write_text("{}", encoding="utf-8")
            proc = subprocess.Popen(
                [sys.executable, "-c", "pass"],
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            proc.wait(timeout=5)
            running = record(
                "issue#231:initial",
                "worker",
                swarm.ProcessStatus.RUNNING,
                pid=proc.pid,
            )
            restarted_tracker = make_tracker([running])

            with (
                patch.object(swarm, "tracker", restarted_tracker),
                patch.object(swarm, "PROCESS_REGISTRY_FILE", registry),
            ):
                swarm.reset_process_history(preserve_running=False)

                self.assertEqual([], restarted_tracker._history)
                self.assertFalse(registry.exists())
                allowed, reason = restarted_tracker.should_dispatch(
                    "issue#231:initial",
                    "worker",
                )
                self.assertTrue(allowed)
                self.assertEqual("new event", reason)

    def test_self_restart_supervises_live_pid_until_same_run_reconciles_it(self):
        real_sleep = time.sleep
        with tempfile.TemporaryDirectory() as tmp_dir:
            temp_path = Path(tmp_dir)
            registry = temp_path / "registry.json"
            marker = temp_path / "finish"
            log_file = temp_path / "child.log"
            log_file.write_text("", encoding="utf-8")
            child_code = (
                "import pathlib, sys, time\n"
                "marker = pathlib.Path(sys.argv[1])\n"
                "while not marker.exists():\n"
                "    time.sleep(0.01)\n"
            )
            proc = subprocess.Popen(
                [sys.executable, "-c", child_code, str(marker)],
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )

            try:
                original_tracker = make_tracker([])
                with patch.object(swarm, "PROCESS_REGISTRY_FILE", registry):
                    original_tracker.register(
                        proc=proc,
                        role="worker",
                        ai_name="codex",
                        model="5.6 sol",
                        reasoning="높음",
                        task_ref="issue#212:initial",
                        branch="worker/212-codex-exits-the-daemon",
                        command="long-lived child",
                        cwd=tmp_dir,
                        log_file=str(log_file),
                    )
                    restarted_tracker = swarm.ProcessTracker()

                    self.assertEqual(0, restarted_tracker.active_count)
                    self.assertEqual(1, restarted_tracker.outstanding_count)
                    allowed, reason = restarted_tracker.should_dispatch(
                        "issue#212:initial",
                        "worker",
                    )
                    self.assertFalse(allowed)
                    self.assertEqual(swarm.DISPATCH_RUNNING, reason)

                    with patch.object(swarm, "tracker", restarted_tracker):
                        swarm.reset_process_history(preserve_running=True)

                    def finish_during_sleep(_interval):
                        marker.touch()
                        real_sleep(0.2)

                    with (
                        patch.object(swarm, "tracker", restarted_tracker),
                        patch.object(swarm, "sync_main_and_restart_if_updated"),
                        patch.object(swarm, "process_polling_cycle") as cycle,
                        patch.object(swarm.signal, "signal"),
                        patch.object(
                            swarm.time,
                            "sleep",
                            side_effect=finish_during_sleep,
                        ) as sleep,
                    ):
                        swarm.run_loop(interval=1, dry_run=True)

                    self.assertGreaterEqual(cycle.call_count, 2)
                    self.assertGreaterEqual(sleep.call_count, 1)
                    self.assertTrue(
                        all(call.args == (1,) for call in sleep.call_args_list)
                    )
                    reconciled = restarted_tracker._history[0]
                    self.assertEqual(swarm.ProcessStatus.COMPLETED, reconciled.status)
                    self.assertEqual(0, reconciled.exit_code)
                    self.assertEqual(0, restarted_tracker.outstanding_count)
                    proc.returncode = reconciled.exit_code
            finally:
                if proc.returncode is None:
                    proc.terminate()
                    proc.wait(timeout=5)

    def test_reset_process_history_clears_completed_and_failed(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            registry = Path(tmp_dir) / "registry.json"
            registry.write_text("{}", encoding="utf-8")

            tracker = swarm.tracker
            original_active = dict(tracker._active)
            original_history = list(tracker._history)
            try:
                tracker._active["123"] = (None, SimpleNamespace())
                failed_record = record(
                    "issue#1:initial", "worker", swarm.ProcessStatus.FAILED
                )
                completed_record = record(
                    "issue#2:initial", "worker", swarm.ProcessStatus.COMPLETED
                )
                tracker._history.extend([failed_record, completed_record])

                with patch.object(swarm, "PROCESS_REGISTRY_FILE", registry):
                    swarm.reset_process_history()

                # Registry should be removed because no surviving records remained
                self.assertFalse(registry.exists())
                self.assertEqual({}, tracker._active)
                self.assertEqual([], tracker._history)
            finally:
                tracker._active = original_active
                tracker._history = original_history

    def test_reset_process_history_preserves_active_provider_cooldown(self):
        """A restart must not forget that an AI is still over its quota.

        `run_loop` exits after one idle cycle and `--once` is meant to be
        re-invoked by a scheduler, so `reset_process_history()` runs on every
        orchestrator restart. If it wiped an unexpired provider cooldown, the
        very next cycle would re-dispatch a prompt to an AI already known to
        reject it.
        """
        with tempfile.TemporaryDirectory() as tmp_dir:
            registry = Path(tmp_dir) / "registry.json"
            registry.write_text("{}", encoding="utf-8")

            active_retry_after = (
                datetime.now(timezone.utc) + timedelta(minutes=30)
            ).isoformat()
            expired_retry_after = (
                datetime.now(timezone.utc) - timedelta(minutes=1)
            ).isoformat()

            active_cooldown = record(
                "maintain#39-comment",
                "maintainer",
                swarm.ProcessStatus.DEFERRED,
                retry_after=active_retry_after,
                ai_name="antigravity",
                defer_scope="provider",
            )

            tracker = swarm.tracker
            original_active = dict(tracker._active)
            original_history = list(tracker._history)
            try:
                tracker._active["123"] = (None, SimpleNamespace())
                tracker._history = [
                    active_cooldown,
                    # Expired: no longer blocking anything, must not survive.
                    record(
                        "maintain#12-comment",
                        "maintainer",
                        swarm.ProcessStatus.DEFERRED,
                        retry_after=expired_retry_after,
                        ai_name="codex",
                        defer_scope="provider",
                    ),
                    # Event-scope defer (e.g. a one-off CLI timeout) is not an
                    # AI-wide limit and must not survive.
                    record(
                        "review#30-abc123",
                        "reviewer",
                        swarm.ProcessStatus.DEFERRED,
                        retry_after=active_retry_after,
                        ai_name="antigravity",
                        defer_scope="event",
                    ),
                    # FAILED records must not survive across restarts (Issue #303).
                    record("issue#7:initial", "worker", swarm.ProcessStatus.FAILED),
                ]

                with patch.object(swarm, "PROCESS_REGISTRY_FILE", registry):
                    swarm.reset_process_history()

                    self.assertEqual({}, tracker._active)
                    self.assertEqual(1, len(tracker._history))
                    self.assertIn(active_cooldown, tracker._history)
                    self.assertTrue(registry.exists())
                    persisted = json.loads(registry.read_text(encoding="utf-8"))
                    self.assertEqual(1, len(persisted["history"]))

                    # And the preserved cooldown actually blocks a fresh
                    # dispatch to that AI post-restart.
                    allowed, reason = tracker.should_dispatch(
                        "issue#99:initial", "worker", ai_name="antigravity",
                    )
                    self.assertFalse(allowed)
                    self.assertIn(swarm.DISPATCH_PROVIDER_COOLDOWN, reason)
            finally:
                tracker._active = original_active
                tracker._history = original_history

    def test_ended_at_none_does_not_cause_sliding_cooldown_window(self):
        temp_dir = Path(tempfile.mkdtemp())
        log_file = temp_dir / "process.log"
        log_file.write_text("Error: Individual quota reached. Resets in 1h.\n", encoding="utf-8")
        started_at = "2026-07-30T01:00:00+00:00"
        tracked = swarm.TrackedProcess(
            pid=1234,
            role="worker",
            ai_name="antigravity",
            model="gemini 3.1 pro",
            reasoning="high",
            task_ref="issue#303:initial",
            branch="worker/303-branch",
            command="agy -p",
            cwd="/repo",
            log_file=str(log_file),
            started_at=started_at,
            ended_at=None,
            exit_code=1,
            status=swarm.ProcessStatus.FAILED,
        )
        tracker = make_tracker([tracked])

        tracker._reclassify_deferred_failures()

        self.assertEqual(swarm.ProcessStatus.DEFERRED, tracked.status)
        expected_retry = "2026-07-30T02:01:00+00:00"  # 1h + 1m buffer from started_at
        self.assertEqual(expected_retry, tracked.retry_after)

        # Calling again must yield the exact same retry_after based on started_at, not sliding
        tracked.status = swarm.ProcessStatus.FAILED
        tracker._reclassify_deferred_failures()
        self.assertEqual(expected_retry, tracked.retry_after)

    def test_reset_process_history_logs_preserved_provider_cooldown(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            registry = Path(tmp_dir) / "registry.json"
            registry.write_text("{}", encoding="utf-8")

            active_retry = (datetime.now(timezone.utc) + timedelta(minutes=30)).isoformat()
            cooldown_rec = record(
                "maintain#39-comment",
                "maintainer",
                swarm.ProcessStatus.DEFERRED,
                retry_after=active_retry,
                ai_name="antigravity",
                defer_scope="provider",
            )
            failed_rec = record(
                "issue#100:initial",
                "worker",
                swarm.ProcessStatus.FAILED,
                ai_name="codex",
            )

            tracker = swarm.tracker
            original_history = list(tracker._history)
            try:
                tracker._history = [cooldown_rec, failed_rec]
                with patch.object(swarm, "PROCESS_REGISTRY_FILE", registry), \
                     patch.object(swarm.log, "info") as mock_info:
                    swarm.reset_process_history()

                    # Only active provider cooldown record is logged as preserved provider cooldown
                    mock_info.assert_called_once_with(
                        "⏸️ Preserving '%s' provider cooldown across restart (retry after %s).",
                        "antigravity",
                        active_retry,
                    )
            finally:
                tracker._history = original_history

    def test_run_loop_exits_after_one_idle_cycle(self):
        tracker = SimpleNamespace(
            active_count=0,
            outstanding_count=0,
            poll_all=lambda: None,
        )
        with (
            patch.object(swarm, "tracker", tracker),
            patch.object(
                swarm,
                "sync_main_and_restart_if_updated",
            ) as sync_main_and_restart_if_updated,
            patch.object(swarm, "process_polling_cycle") as process_polling_cycle,
            patch.object(swarm.time, "sleep") as sleep,
        ):
            swarm.run_loop(interval=1, dry_run=True)

        sync_main_and_restart_if_updated.assert_called_once_with(True)
        process_polling_cycle.assert_called_once_with(True, initial=True)
        sleep.assert_not_called()


if __name__ == "__main__":
    unittest.main()
