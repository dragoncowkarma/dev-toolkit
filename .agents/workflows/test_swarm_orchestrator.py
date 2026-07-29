"""Regression tests for the swarm lifecycle state machine."""

import importlib.util
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

    def was_dispatched(self, task_ref, role):
        return (task_ref, role) in self.dispatched


class LifecycleSignalTests(unittest.TestCase):
    def test_dispatch_history_blocks_same_event_after_process_completion(self):
        tracker = swarm.ProcessTracker.__new__(swarm.ProcessTracker)
        tracker._active = {}
        tracker._history = [
            SimpleNamespace(task_ref="review#12-abc123", role="reviewer"),
        ]

        self.assertTrue(
            tracker.was_dispatched("review#12-abc123", "reviewer"),
        )
        self.assertFalse(
            tracker.was_dispatched("review#12-def456", "reviewer"),
        )

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


if __name__ == "__main__":
    unittest.main()
