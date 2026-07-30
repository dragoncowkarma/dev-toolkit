"""Regression tests for the swarm lifecycle state machine."""

import importlib.util
import tempfile
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

    def test_completed_process_is_retried_when_transition_is_unconfirmed(self):
        tracker = make_tracker([
            record("review#12-abc123", "reviewer", swarm.ProcessStatus.COMPLETED),
        ])

        allowed, reason = tracker.should_dispatch(
            "review#12-abc123",
            "reviewer",
            completion_confirmed=False,
        )

        self.assertTrue(allowed)
        self.assertIn("retry after unconfirmed completion", reason)

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

    def test_monthly_spend_limit_uses_default_cooldown(self):
        ended_at = "2026-07-30T02:37:57+00:00"

        retry_after = swarm.ProcessTracker._provider_retry_after(
            "You've hit your monthly spend limit",
            ended_at,
        )

        self.assertEqual("2026-07-30T03:37:57+00:00", retry_after)

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

    def test_codex_does_not_silently_replace_unknown_model(self):
        argv = swarm.build_ai_argv(
            "codex", "custom-provider-model", "높음", self.prompt_file, "/repo",
        )

        self.assertEqual("custom-provider-model", argv[argv.index("-m") + 1])

    def test_antigravity_embeds_effort_in_resolved_model(self):
        argv = swarm.build_ai_argv(
            "antigravity", "gemini 3.1 pro", "높음", self.prompt_file, "/repo",
        )

        self.assertEqual("Gemini 3.6 Flash (High)", argv[argv.index("--model") + 1])
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

    def test_pr_without_issue_number_skips_further_api_calls(self):
        untitled_pr = {**self.pr, "title": "[PR] fix things"}
        tracker = FakeTracker()
        with (
            patch.object(swarm, "tracker", tracker),
            patch.object(swarm, "fetch_pr_comments") as fetch_comments,
            patch.object(swarm, "fetch_issue") as fetch_issue,
            patch.object(swarm, "dispatch_reviewer") as dispatch_reviewer,
        ):
            swarm.process_prs(open_prs=[untitled_pr])

        fetch_comments.assert_not_called()
        fetch_issue.assert_not_called()
        dispatch_reviewer.assert_not_called()

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


class RuntimeLifecycleTests(unittest.TestCase):
    def test_reset_process_history_clears_registry_and_memory(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            registry = Path(tmp_dir) / "registry.json"
            registry.write_text("{}", encoding="utf-8")

            tracker = swarm.tracker
            original_active = dict(tracker._active)
            original_history = list(tracker._history)
            try:
                tracker._active["123"] = (None, SimpleNamespace())
                tracker._history.append(SimpleNamespace())
                with patch.object(swarm, "PROCESS_REGISTRY_FILE", registry):
                    swarm.reset_process_history()

                self.assertFalse(registry.exists())
                self.assertEqual({}, tracker._active)
                self.assertEqual([], tracker._history)
            finally:
                tracker._active = original_active
                tracker._history = original_history

    def test_run_loop_exits_after_one_idle_cycle(self):
        tracker = SimpleNamespace(active_count=0, poll_all=lambda: None)
        with (
            patch.object(swarm, "tracker", tracker),
            patch.object(swarm, "process_polling_cycle") as process_polling_cycle,
            patch.object(swarm.time, "sleep") as sleep,
        ):
            swarm.run_loop(interval=1, dry_run=True)

        process_polling_cycle.assert_called_once_with(True, initial=True)
        sleep.assert_not_called()


if __name__ == "__main__":
    unittest.main()
