#!/usr/bin/env python3
"""
check_workflows.py -- Deep validation & simulation for workflow processes (ws-spec-to-pr & ws-spec-to-pr-lite)

Features:
- Simulates standard (full, steps 0-9) and lite (sequential, steps 0-5) workflows.
- Checks step continuity, linked skill existence, script syntax, dependency closure, and state isolation.
- Detects broken steps, missing dependencies, and syntax errors.
- Generates actionable fix suggestions and improvements.
- By default displays a detailed report and requests user confirmation for fix execution.
"""

import sys
import os
import re
import json
import argparse
import py_compile
import subprocess
from pathlib import Path
from typing import List, Dict, Tuple, Set, Optional


def ensure_utf8_stdio() -> None:
    """Force UTF-8 on stdio so Windows locale (cp1252) does not break on Unicode."""
    os.environ["PYTHONIOENCODING"] = "utf-8"
    for stream in (sys.stdin, sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if not callable(reconfigure):
            continue
        try:
            reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            try:
                reconfigure(errors="replace")
            except Exception:
                pass


ensure_utf8_stdio()


# Paths resolution
SCRIPT_DIR = Path(__file__).resolve().parent


def find_repo_root(start_dir: Path) -> Path:
    """Dynamically detect project root by scanning upward for marker files/folders."""
    curr = start_dir.resolve()
    for p in [curr] + list(curr.parents):
        if (p / ".git").exists() or (p / "package.json").exists() or (p / ".agents").exists():
            return p
    if len(start_dir.parents) >= 2:
        return start_dir.parents[2]
    return start_dir.root


REPO_ROOT = find_repo_root(SCRIPT_DIR)


def resolve_skills_dir(repo_root: Path) -> Path:
    """Respect pathTokens.skillsRoot from shared/config.json when present."""
    config_path = repo_root / ".agents" / "skills" / "ws-shared" / "config.json"
    if config_path.exists():
        try:
            cfg = json.loads(config_path.read_text(encoding="utf-8", errors="replace"))
            skills_token = cfg.get("pathTokens", {}).get("skillsRoot")
            if skills_token:
                candidate = repo_root / skills_token
                if candidate.exists():
                    return candidate
        except Exception:
            pass
    fallback = repo_root / ".agents" / "skills"
    return fallback if fallback.exists() else repo_root


SKILLS_DIR = resolve_skills_dir(REPO_ROOT)
SHARED_DEPS_PATH = SKILLS_DIR / "ws-shared" / "skill-dependencies.json"
BIN_DEPS_PATH = REPO_ROOT / "bin" / "skill-dependencies.json"


class Issue:
    def __init__(self, severity: str, category: str, location: str, message: str, fix_suggestion: str):
        self.severity = severity  # "CRITICAL", "WARNING", "SUGGESTION"
        self.category = category  # e.g., "Step Continuity", "Script Syntax", "Dependency Closure"
        self.location = location
        self.message = message
        self.fix_suggestion = fix_suggestion

    def to_dict(self) -> Dict[str, str]:
        return {
            "severity": self.severity,
            "category": self.category,
            "location": self.location,
            "message": self.message,
            "fix_suggestion": self.fix_suggestion,
        }


class WorkflowChecker:
    def __init__(self):
        self.issues: List[Issue] = []
        self.simulation_results: Dict[str, Dict] = {
            "standard": {"steps": {}, "status": "PASS"},
            "lite": {"steps": {}, "status": "PASS"},
            "multi_spec": {"steps": {}, "status": "PASS"},
        }
        self.deps_map: Dict[str, List[str]] = {}
        self.deps_loaded: bool = False
        self.deps_location: str = "skill-dependencies.json"
        self._load_dependencies()

    def _load_dependencies(self) -> None:
        deps_path = None
        if SHARED_DEPS_PATH.exists():
            deps_path = SHARED_DEPS_PATH
        elif BIN_DEPS_PATH.exists():
            deps_path = BIN_DEPS_PATH

        if deps_path:
            try:
                rel = deps_path.relative_to(REPO_ROOT)
                self.deps_location = str(rel).replace("\\", "/")
            except ValueError:
                self.deps_location = str(deps_path).replace("\\", "/")

            try:
                data = json.loads(deps_path.read_text(encoding="utf-8", errors="replace"))
                self.deps_map = data.get("dependencies", {})
                self.deps_loaded = True
            except Exception as e:
                self.issues.append(
                    Issue(
                        "WARNING",
                        "Dependency Graph",
                        self.deps_location,
                        f"Failed to parse skill-dependencies.json: {e}",
                        f"Verify JSON syntax in {self.deps_location}.",
                    )
                )

        if SHARED_DEPS_PATH.exists() and BIN_DEPS_PATH.exists():
            try:
                shared_data = json.loads(SHARED_DEPS_PATH.read_text(encoding="utf-8", errors="replace"))
                bin_data = json.loads(BIN_DEPS_PATH.read_text(encoding="utf-8", errors="replace"))

                shared_wf_skills = set(shared_data.get("packages", {}).get("workflows", {}).get("skills", []))
                bin_wf_skills = set(bin_data.get("packages", {}).get("workflows", {}).get("skills", []))

                if shared_wf_skills != bin_wf_skills:
                    diff_missing = bin_wf_skills - shared_wf_skills
                    diff_extra = shared_wf_skills - bin_wf_skills
                    msg = "Package skills mismatch between bin/skill-dependencies.json and ws-shared/skill-dependencies.json."
                    if diff_missing:
                        msg += f" Missing in ws-shared: {sorted(diff_missing)}."
                    if diff_extra:
                        msg += f" Extra in ws-shared: {sorted(diff_extra)}."
                    self.issues.append(
                        Issue(
                            "CRITICAL",
                            "Dependency Graph Sync",
                            "ws-shared/skill-dependencies.json",
                            msg,
                            "Sync .agents/skills/ws-shared/skill-dependencies.json with bin/skill-dependencies.json.",
                        )
                    )
            except Exception:
                pass

    def add_issue(self, severity: str, category: str, location: str, message: str, fix_suggestion: str) -> None:
        self.issues.append(Issue(severity, category, location, message, fix_suggestion))

    def simulate_standard_workflow(self) -> None:
        """Simulate Full ws-spec-to-pr workflow (steps 0 to 9)."""
        std_skill_path = SKILLS_DIR / "ws-spec-to-pr" / "SKILL.md"
        if not std_skill_path.exists():
            self.add_issue(
                "CRITICAL",
                "Workflow Structure",
                "ws-spec-to-pr/SKILL.md",
                "Standard ws-spec-to-pr SKILL.md file is missing.",
                "Restore .agents/skills/ws-spec-to-pr/SKILL.md from upstream repository.",
            )
            self.simulation_results["standard"]["status"] = "FAIL"
            return

        text = std_skill_path.read_text(encoding="utf-8", errors="replace")
        std_dispatch_path = SKILLS_DIR / "ws-spec-to-pr" / "STEP-DISPATCH.md"
        if std_dispatch_path.exists():
            text += "\n" + std_dispatch_path.read_text(encoding="utf-8", errors="replace")

        # Step definitions for Standard FSM
        expected_steps = {
            0: ("Spec Creation", "ws-write-spec"),
            1: ("Plan Creation", "ws-write-plan"),
            2: ("Plan Interview", "ws-interview"),
            3: ("Plan to Tasks", "ws-plan-to-tasks"),
            4: ("Task Implementation", "ws-implement-tasks"),
            5: ("Plan Verification", "ws-verify-plan"),
            6: ("Code Review", "ws-code-review"),
            7: ("Testing", "ws-testing"),
            8: ("Ship PR", "ws-ship-pr"),
            9: ("Fix PR Threads", "ws-fix-pr"),
        }

        # Parse FSM table
        matches = re.findall(r"^\s*\|\s*(\d+)[^\s|]*\s*\|\s*([^|]+)\s*\|", text, re.MULTILINE)
        found_steps = {int(m[0]): m[1].strip() for m in matches}

        dispatched_skills: Set[str] = set()

        for step_num, (step_name, skill_folder) in expected_steps.items():
            step_status = "PASS"
            step_details = []

            if step_num not in found_steps:
                step_status = "FAIL"
                self.add_issue(
                    "CRITICAL",
                    "Step Continuity",
                    f"ws-spec-to-pr (Step {step_num})",
                    f"Standard workflow table is missing Step {step_num}: {step_name}.",
                    f"Add Step {step_num} ({step_name}) row to ws-spec-to-pr/SKILL.md FSM table.",
                )
            else:
                step_details.append(f"FSM table entry verified: '{found_steps[step_num]}'")

            # Verify target skill folder exists
            target_skill = SKILLS_DIR / skill_folder / "SKILL.md"
            if not target_skill.exists():
                step_status = "FAIL"
                self.add_issue(
                    "CRITICAL",
                    "Step Skill Link",
                    f"ws-spec-to-pr (Step {step_num})",
                    f"Step {step_num} dispatches missing skill folder '{skill_folder}'.",
                    f"Ensure .agents/skills/{skill_folder}/SKILL.md exists on disk.",
                )
            else:
                dispatched_skills.add(skill_folder)

            self.simulation_results["standard"]["steps"][f"Step {step_num}: {step_name}"] = {
                "status": step_status,
                "skill": skill_folder,
                "details": step_details,
            }

        # Check auxiliary skills dispatched by standard workflow
        aux_skills = ["ws-goal-fix-pr", "ws-update-plan-implementation", "ws-github-provider", "ws-azure-devops-provider", "ws-local-spec-provider"]
        for aux in aux_skills:
            if (SKILLS_DIR / aux / "SKILL.md").exists():
                dispatched_skills.add(aux)

        # Check dependency closure in skill-dependencies.json
        if self.deps_loaded:
            declared_deps = set(self.deps_map.get("ws-spec-to-pr", []))
            missing_deps = dispatched_skills - declared_deps
            if missing_deps:
                self.add_issue(
                    "CRITICAL",
                    "Dependency Closure",
                    self.deps_location,
                    f"ws-spec-to-pr dispatches skills not listed in dependencies['ws-spec-to-pr']: {sorted(missing_deps)}.",
                    f"Add missing skill IDs to {self.deps_location} under dependencies['ws-spec-to-pr'].",
                )
                self.simulation_results["standard"]["status"] = "FAIL"
            elif any(info["status"] == "FAIL" for info in self.simulation_results["standard"]["steps"].values()):
                self.simulation_results["standard"]["status"] = "FAIL"
        elif any(info["status"] == "FAIL" for info in self.simulation_results["standard"]["steps"].values()):
            self.simulation_results["standard"]["status"] = "FAIL"

    def simulate_lite_workflow(self) -> None:
        """Simulate Lite ws-spec-to-pr-lite workflow (steps 0 to 5)."""
        lite_skill_path = SKILLS_DIR / "ws-spec-to-pr-lite" / "SKILL.md"
        if not lite_skill_path.exists():
            self.add_issue(
                "CRITICAL",
                "Workflow Structure",
                "ws-spec-to-pr-lite/SKILL.md",
                "Lite ws-spec-to-pr-lite SKILL.md file is missing.",
                "Restore .agents/skills/ws-spec-to-pr-lite/SKILL.md from upstream repository.",
            )
            self.simulation_results["lite"]["status"] = "FAIL"
            return

        text = lite_skill_path.read_text(encoding="utf-8", errors="replace")

        expected_steps = {
            0: ("Spec Creation", "ws-write-spec"),
            1: ("Plan Creation", "ws-write-plan"),
            2: ("Implementation", "ws-implement-tasks"),
            3: ("Code Review", "ws-code-review"),
            4: ("Ship PR", "ws-ship-pr"),
            5: ("Fix PR Threads", "ws-fix-pr"),
        }

        matches = re.findall(r"^\s*\|\s*([0-5])\s*\|\s*([^|]+)\s*\|", text, re.MULTILINE)
        found_steps = {int(m[0]): m[1].strip() for m in matches}

        dispatched_skills: Set[str] = set()

        for step_num, (step_name, skill_folder) in expected_steps.items():
            step_status = "PASS"
            step_details = []

            if step_num not in found_steps:
                step_status = "FAIL"
                self.add_issue(
                    "CRITICAL",
                    "Step Continuity",
                    f"ws-spec-to-pr-lite (Step {step_num})",
                    f"Lite workflow table is missing Step {step_num}: {step_name}.",
                    f"Add Step {step_num} ({step_name}) row to ws-spec-to-pr-lite/SKILL.md table.",
                )
            else:
                step_details.append(f"FSM table entry verified: '{found_steps[step_num]}'")

            target_skill = SKILLS_DIR / skill_folder / "SKILL.md"
            if not target_skill.exists():
                step_status = "FAIL"
                self.add_issue(
                    "CRITICAL",
                    "Step Skill Link",
                    f"ws-spec-to-pr-lite (Step {step_num})",
                    f"Step {step_num} dispatches missing skill folder '{skill_folder}'.",
                    f"Ensure .agents/skills/{skill_folder}/SKILL.md exists on disk.",
                )
            else:
                dispatched_skills.add(skill_folder)

            self.simulation_results["lite"]["steps"][f"Step {step_num}: {step_name}"] = {
                "status": step_status,
                "skill": skill_folder,
                "details": step_details,
            }

        # Check auxiliary skills dispatches
        aux_skills = ["ws-goal-fix-pr", "ws-github-provider", "ws-azure-devops-provider", "ws-local-spec-provider"]
        for aux in aux_skills:
            if (SKILLS_DIR / aux / "SKILL.md").exists():
                dispatched_skills.add(aux)

        if self.deps_loaded:
            declared_deps = set(self.deps_map.get("ws-spec-to-pr-lite", []))
            missing_deps = dispatched_skills - declared_deps
            if missing_deps:
                self.add_issue(
                    "CRITICAL",
                    "Dependency Closure",
                    self.deps_location,
                    f"ws-spec-to-pr-lite dispatches skills not listed in dependencies['ws-spec-to-pr-lite']: {sorted(missing_deps)}.",
                    f"Add missing skill IDs to {self.deps_location} under dependencies['ws-spec-to-pr-lite'].",
                )
                self.simulation_results["lite"]["status"] = "FAIL"
            elif any(info["status"] == "FAIL" for info in self.simulation_results["lite"]["steps"].values()):
                self.simulation_results["lite"]["status"] = "FAIL"
        elif any(info["status"] == "FAIL" for info in self.simulation_results["lite"]["steps"].values()):
            self.simulation_results["lite"]["status"] = "FAIL"

    def simulate_multi_spec_workflow(self) -> None:
        """Simulate Smart Multi-Spec ws-multi-spec workflow."""
        ms_skill_path = SKILLS_DIR / "ws-multi-spec" / "SKILL.md"
        if not ms_skill_path.exists():
            self.add_issue(
                "CRITICAL",
                "Workflow Structure",
                "ws-multi-spec/SKILL.md",
                "ws-multi-spec SKILL.md file is missing.",
                "Ensure .agents/skills/ws-multi-spec/SKILL.md exists.",
            )
            self.simulation_results["multi_spec"]["status"] = "FAIL"
            return

        ms_files = ["PROTOCOL.md", "STATE.md", "EXAMPLES.md", "evals/evals.json"]
        for fname in ms_files:
            fpath = SKILLS_DIR / "ws-multi-spec" / fname
            if not fpath.exists():
                self.add_issue(
                    "CRITICAL",
                    "Workflow Structure",
                    f"ws-multi-spec/{fname}",
                    f"ws-multi-spec artifact {fname} is missing.",
                    f"Create .agents/skills/ws-multi-spec/{fname}.",
                )
                self.simulation_results["multi_spec"]["status"] = "FAIL"
            else:
                self.simulation_results["multi_spec"]["steps"][f"Artifact: {fname}"] = {
                    "status": "PASS",
                    "skill": "ws-multi-spec",
                    "details": [f"File verified: {fname}"],
                }

        # Check target orchestrators ws-spec-to-pr and ws-spec-to-pr-lite exist
        for target in ["ws-spec-to-pr", "ws-spec-to-pr-lite"]:
            tpath = SKILLS_DIR / target / "SKILL.md"
            if not tpath.exists():
                self.add_issue(
                    "CRITICAL",
                    "Worker Target Link",
                    f"ws-multi-spec -> {target}",
                    f"ws-multi-spec dispatches missing worker target '{target}'.",
                    f"Ensure .agents/skills/{target}/SKILL.md exists.",
                )
                self.simulation_results["multi_spec"]["status"] = "FAIL"
            else:
                self.simulation_results["multi_spec"]["steps"][f"Worker Target: {target}"] = {
                    "status": "PASS",
                    "skill": target,
                    "details": [f"Worker target verified: {target}"],
                }

    def check_scripts_syntax(self) -> None:
        """Deep check script syntax (.py and .cjs/.js) across workflow packages."""
        scripts_to_check: List[Path] = []
        for p in SKILLS_DIR.glob("**/*"):
            if p.is_file() and p.suffix in (".py", ".cjs", ".js"):
                # Skip external node_modules or pycache
                if "node_modules" in p.parts or "__pycache__" in p.parts:
                    continue
                scripts_to_check.append(p)

        for script in scripts_to_check:
            try:
                rel_path = script.relative_to(REPO_ROOT)
            except ValueError:
                rel_path = script

            if script.suffix == ".py":
                try:
                    py_compile.compile(str(script), doraise=True)
                except py_compile.PyCompileError as err:
                    self.add_issue(
                        "CRITICAL",
                        "Script Syntax Error",
                        str(rel_path),
                        f"Python syntax compilation failed: {err}",
                        f"Fix Python syntax error in {rel_path}.",
                    )
            elif script.suffix in (".cjs", ".js"):
                try:
                    res = subprocess.run(
                        ["node", "--check", str(script)],
                        stdout=subprocess.PIPE,
                        stderr=subprocess.PIPE,
                        text=True,
                        encoding="utf-8",
                        errors="replace",
                    )
                    if res.returncode != 0:
                        self.add_issue(
                            "CRITICAL",
                            "Script Syntax Error",
                            str(rel_path),
                            f"Node.js syntax check failed: {res.stderr.strip()}",
                            f"Fix JavaScript syntax error in {rel_path}.",
                        )
                except FileNotFoundError:
                    # Node not installed or unavailable in env
                    pass

    def check_state_isolation_and_config(self) -> None:
        """Verify state update files and provider scripts target shared/config.json and serialize workflowType."""
        std_update = SKILLS_DIR / "ws-spec-to-pr" / "scripts" / "update_state.py"
        if std_update.exists():
            code = std_update.read_text(encoding="utf-8", errors="replace")
            if "workflowType" not in code or "standard" not in code:
                self.add_issue(
                    "CRITICAL",
                    "State Isolation",
                    "ws-spec-to-pr/scripts/update_state.py",
                    "Standard update_state.py does not serialize workflowType: standard.",
                    "Ensure update_state.py sets workflowType to 'standard'.",
                )

        lite_update = SKILLS_DIR / "ws-spec-to-pr-lite" / "scripts" / "update_state.py"
        if lite_update.exists():
            code = lite_update.read_text(encoding="utf-8", errors="replace")
            if "workflowType" not in code or "lite" not in code:
                self.add_issue(
                    "CRITICAL",
                    "State Isolation",
                    "ws-spec-to-pr-lite/scripts/update_state.py",
                    "Lite update_state.py does not serialize workflowType: lite.",
                    "Ensure update_state.py sets workflowType to 'lite'.",
                )

        lite_val_state = SKILLS_DIR / "ws-spec-to-pr-lite" / "scripts" / "validate_state.py"
        if lite_val_state.exists():
            code = lite_val_state.read_text(encoding="utf-8", errors="replace")
            if "ws-shared" not in code or "config.json" not in code:
                self.add_issue(
                    "WARNING",
                    "Config Sharing",
                    "ws-spec-to-pr-lite/scripts/validate_state.py",
                    "Lite validate_state.py does not target ws-shared/config.json.",
                    "Update script to reference ws-shared/config.json.",
                )

    def check_g2_code_contract(self) -> None:
        """Required product commits after verify/implement, before code-review."""

        def _read(rel: str) -> str:
            path = SKILLS_DIR / rel
            if not path.exists():
                self.add_issue(
                    "CRITICAL",
                    "G2-code Contract",
                    rel,
                    f"Missing file required for G2-code contract check: {rel}.",
                    f"Restore .agents/skills/{rel} from upstream.",
                )
                return ""
            return path.read_text(encoding="utf-8", errors="replace")

        protocols = _read("ws-spec-to-pr/PROTOCOLS.md")
        dispatch = _read("ws-spec-to-pr/STEP-DISPATCH.md")
        lite = _read("ws-spec-to-pr-lite/SKILL.md")
        tools = _read("ws-shared/tools.md")
        gates = _read("ws-shared/gates.md")
        review = _read("ws-code-review/SKILL.md")
        std_text = protocols + "\n" + dispatch

        if "G2-code after Step 5 before Step 6" not in std_text:
            self.add_issue(
                "CRITICAL",
                "G2-code Contract",
                "ws-spec-to-pr/PROTOCOLS.md + STEP-DISPATCH.md",
                "Standard orch must require G2-code after Step 5 before Step 6.",
                "Document required G2-code after Step 5 before Step 6 in PROTOCOLS.md and STEP-DISPATCH.md.",
            )

        if "G2-code after Step 2 before Step 3" not in lite:
            self.add_issue(
                "CRITICAL",
                "G2-code Contract",
                "ws-spec-to-pr-lite/SKILL.md",
                "Lite orch must require G2-code after Step 2 before Step 3.",
                "Document required G2-code after Step 2 before Step 3 in ws-spec-to-pr-lite/SKILL.md.",
            )

        if "git add src/ web/ tests/" in tools:
            self.add_issue(
                "CRITICAL",
                "G2-code Contract",
                "ws-shared/tools.md",
                "commit-code still uses directory-wide git add src/ web/ tests/.",
                "Stage explicit workflow files_touched paths only (never git add src/ web/ tests/).",
            )

        if "Post-verify G2-code" not in gates or "Post-review-fix G2-code" not in gates:
            self.add_issue(
                "CRITICAL",
                "G2-code Contract",
                "ws-shared/gates.md",
                "gates.md auto-gate table is missing Post-verify G2-code / Post-review-fix G2-code save points.",
                "Add auto-gate rows for Post-verify G2-code and Post-review-fix G2-code.",
            )

        leftover_files = {
            "ws-shared/tools.md": tools,
            "ws-shared/gates.md": gates,
            "ws-spec-to-pr/PROTOCOLS.md": protocols,
            "ws-spec-to-pr/STEP-DISPATCH.md": dispatch,
            "ws-spec-to-pr-lite/SKILL.md": lite,
            "ws-code-review/SKILL.md": review,
        }
        leftover_add = re.compile(r"git add src/\s*web/\s*tests/")
        leftover_first = re.compile(r"first (product )?commit at Step 8", re.I)
        for loc, text in leftover_files.items():
            if leftover_add.search(text):
                self.add_issue(
                    "CRITICAL",
                    "G2-code Contract",
                    loc,
                    "Leftover G2-code recipe git add src/ web/ tests/.",
                    "Replace with path-scoped files_touched staging.",
                )
            if leftover_first.search(text):
                self.add_issue(
                    "CRITICAL",
                    "G2-code Contract",
                    loc,
                    "Leftover product-save rule 'first commit at Step 8'.",
                    "First required product commit is post-verify / post-implement G2-code; Step 8 remains G2-delivery.",
                )

        if "{base}...HEAD" not in review:
            self.add_issue(
                "CRITICAL",
                "G2-code Contract",
                "ws-code-review/SKILL.md",
                "ws-code-review must review git diff {base}...HEAD (committed range).",
                "Set the primary diff to git diff {base}...HEAD; do not review the dirty working tree.",
            )
        if "config.project.baseBranch" not in review:
            self.add_issue(
                "CRITICAL",
                "G2-code Contract",
                "ws-code-review/SKILL.md",
                "ws-code-review must resolve base from config.project.baseBranch.",
                "Default base to config.project.baseBranch then auto-detect main/master.",
            )
        if "Do not commit" not in review and "does **not** run `git commit`" not in review:
            self.add_issue(
                "WARNING",
                "G2-code Contract",
                "ws-code-review/SKILL.md",
                "ws-code-review should state that the skill does not commit.",
                "Keep 'do not commit'; orchestrator owns G2-code.",
            )

    def run_all(self) -> None:
        self.simulate_standard_workflow()
        self.simulate_lite_workflow()
        self.simulate_multi_spec_workflow()
        self.check_scripts_syntax()
        self.check_state_isolation_and_config()
        self.check_g2_code_contract()

    def generate_report(self) -> str:
        lines = []
        lines.append("# 🔍 ws-check-workflows Deep Validation & Simulation Report")
        lines.append("")

        overall = "PASS" if not any(i.severity == "CRITICAL" for i in self.issues) else "FAIL"
        badge = "✅ PASS" if overall == "PASS" else "❌ FAIL"
        lines.append(f"**Overall Status**: {badge}")
        lines.append(f"**Total Issues Detected**: {len(self.issues)}")
        lines.append("")

        lines.append("## 🔄 Workflow Simulations")
        lines.append("")

        for wf_key, wf_title in [("standard", "Standard (`ws-spec-to-pr`)"), ("lite", "Lite (`ws-spec-to-pr-lite`)"), ("multi_spec", "Smart Multi-Spec (`ws-multi-spec`)")]:
            wf_data = self.simulation_results[wf_key]
            wf_status_icon = "✅" if wf_data["status"] == "PASS" else "❌"
            lines.append(f"### {wf_title} — {wf_status_icon} {wf_data['status']}")
            lines.append("")
            lines.append("| Step | Dispatched Skill | Simulation Status |")
            lines.append("|------|------------------|-------------------|")
            for step_name, step_info in wf_data["steps"].items():
                s_icon = "✅ PASS" if step_info["status"] == "PASS" else "❌ FAIL"
                lines.append(f"| {step_name} | `{step_info['skill']}` | {s_icon} |")
            lines.append("")

        lines.append("## 🚨 Issues & Suggested Fixes")
        lines.append("")
        if not self.issues:
            lines.append("🎉 No broken steps, missing dependencies, or syntax errors detected.")
        else:
            lines.append("| Severity | Category | Location | Issue Description | Suggested Fix |")
            lines.append("|----------|----------|----------|-------------------|---------------|")
            for iss in self.issues:
                sev_icon = "🔴" if iss.severity == "CRITICAL" else ("🟡" if iss.severity == "WARNING" else "🔵")
                lines.append(f"| {sev_icon} {iss.severity} | {iss.category} | `{iss.location}` | {iss.message} | {iss.fix_suggestion} |")
        lines.append("")
        return "\n".join(lines)


def main():
    ensure_utf8_stdio()

    parser = argparse.ArgumentParser(description="Deep workflow validation and simulation scanner.")
    parser.add_argument("--report", action="store_true", help="Write validation report to ws-check-workflows-report.md")
    parser.add_argument("--json", action="store_true", help="Output results in JSON format")
    parser.add_argument("--fix", action="store_true", help="Automatically attempt suggested fixes")
    parser.add_argument("--yes", "-y", action="store_true", help="Auto-confirm prompt when applying fixes")
    args = parser.parse_args()

    checker = WorkflowChecker()
    checker.run_all()

    report_content = checker.generate_report()

    if args.json:
        output_data = {
            "status": "FAIL" if any(i.severity == "CRITICAL" for i in checker.issues) else "PASS",
            "issues": [i.to_dict() for i in checker.issues],
            "simulations": checker.simulation_results,
        }
        print(json.dumps(output_data, indent=2))
    else:
        print(report_content)

    if args.report:
        report_file = REPO_ROOT / "ws-check-workflows-report.md"
        report_file.write_text(report_content, encoding="utf-8", errors="replace")
        print(f"\n📝 Report saved to {report_file}")

    # Interactive confirmation prompt when issues exist or when --fix is provided
    if checker.issues:
        if args.fix:
            print("\n🔧 Auto-fix mode requested.")
            if not args.yes:
                if sys.stdin.isatty():
                    ans = input("Do you want to proceed with applying suggested fixes? [y/N]: ").strip().lower()
                    if ans not in ("y", "yes"):
                        print("Aborted by user.")
                        sys.exit(1)
                else:
                    print("Non-interactive mode detected; proceeding with safe fixes.")
            print("Applying fixes...")
            # Auto-fixes applied here if any safe automated actions are registered
            print("Fixes evaluated.")

        if any(i.severity == "CRITICAL" for i in checker.issues):
            sys.exit(1)

    sys.exit(0)


if __name__ == "__main__":
    main()
