"""Validate the owner's ordered acceptance register; no services or mutations."""
import copy
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
STATES = {"Not started", "In progress", "Implemented awaiting test", "Verified working", "Demo only", "Blocked", "Deferred", "Released"}


def validate(register):
    steps = register["steps"]
    if [step["id"] for step in steps] != [f"{n:02d}" for n in range(1, 16)]:
        raise ValueError("All fifteen ordered steps must remain present")
    seen = set()
    for step in steps:
        if step["status"] not in STATES:
            raise ValueError("Unknown milestone state")
        for item in step["items"]:
            if item["id"] in seen or not item["id"].startswith(step["id"] + "."):
                raise ValueError("Item IDs must be unique and assigned to their milestone")
            seen.add(item["id"])
            if item["status"] not in STATES:
                raise ValueError("Unknown item state")
            for field in ["owner", "dependencies", "changed_files", "commit_note", "verified_scope", "test_result", "runtime_evidence", "next_action", "release_status"]:
                if field not in item or (field not in ("dependencies", "changed_files") and not item[field]):
                    raise ValueError("Missing required evidence field: " + field)
            for path in item["changed_files"]:
                if not (ROOT / path).is_file():
                    raise ValueError("Referenced evidence file is absent: " + path)
            if item["status"] == "Blocked" and not item["missing_input"]:
                raise ValueError("Blocked items must name exact missing input")
            if item["status"] == "Verified working":
                evidence = register["evidence"][item["evidence_ref"]]
                if not item["test_command"] or evidence["passed"] is not True:
                    raise ValueError("Unrun or failed evidence cannot verify an item")
        if step["status"] in ("Verified working", "Released") and any(item["status"] not in ("Verified working", "Released") for item in step["items"]):
            raise ValueError("A partially complete step cannot be marked complete")
    for family in register["blueprint_crosswalk"]:
        if not family["steps"] or any(s not in {step["id"] for step in steps} for s in family["steps"]):
            raise ValueError("Every original family needs a valid milestone destination")
    return len(seen)


class CompletionRegisterTests(unittest.TestCase):
    def setUp(self):
        self.register = json.loads((ROOT / "completion-register.json").read_text())

    def test_all_fifteen_milestones_and_ninety_requirements_have_evidence_fields(self):
        self.assertEqual(validate(self.register), 90)
        self.assertEqual(len(self.register["blueprint_crosswalk"]), 26)

    def test_demo_or_blocked_item_prevents_whole_step_verification(self):
        changed = copy.deepcopy(self.register)
        changed["steps"][11]["status"] = "Verified working"
        with self.assertRaisesRegex(ValueError, "partially complete"):
            validate(changed)

    def test_unrun_evidence_cannot_become_a_pass(self):
        changed = copy.deepcopy(self.register)
        changed["steps"][14]["items"][2]["status"] = "Verified working"
        with self.assertRaisesRegex(ValueError, "Unrun or failed"):
            validate(changed)


if __name__ == "__main__":
    unittest.main()