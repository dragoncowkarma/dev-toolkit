"""Regression tests for the swarm lifecycle state machine."""

import importlib.util
import tempfile
import unittest
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

    def should_dispatch(self, task_ref, role):
        if (task_ref, role) in self.dispatched:
            return False, swarm.DISPATCH_COMPLETED
        return True, "new event"


def make_tracker(history):
    """Build a ProcessTracker with a fixed history and no disk access."""
    tracker = swarm.ProcessTracker.__new__(swarm.ProcessTracker)
    tracker._active = {}
    tracker._history = list(history)
    return tracker


def record(task_ref, role, status, pid=1234):
    return SimpleNamespace(task_ref=task_ref, role=role, status=status, pid=pid)


class DispatchDecisionTests(unittest.TestCase):
    def test_completed_event_is_never_dispatched_again(self):
        tracker = make_tracker([
            record("review#12-abc123", "reviewer", swarm.ProcessStatus.COMPLETED),
        ])

        self.assertFalse(tracker.should_dispatch("review#12-abc123", "reviewer")[0])
        self.assertTrue(tracker.should_dispatch("review#12-def456", "reviewer")[0])

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

    def test_initial_worker_event_is_not_dispatched_twice(self):
        tracker = FakeTracker({("issue#7:initial", "worker")})
        with (
            patch.object(swarm, "tracker", tracker),
            patch.object(swarm, "fetch_open_issues", return_value=[self.issue]),
            patch.object(swarm, "dispatch_worker") as dispatch_worker,
        ):
            swarm.process_issues(open_prs=[])

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

    def test_completed_review_event_is_not_dispatched_again(self):
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


if __name__ == "__main__":
    unittest.main()
