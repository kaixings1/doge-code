"""Tests for prompt template loading and substitution."""

import os
import sys
import tempfile

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from pipeline import prompts


def _make_template(tmpdir: str, name: str, content: str) -> None:
    os.makedirs(tmpdir, exist_ok=True)
    with open(os.path.join(tmpdir, name), "w") as f:
        f.write(content)


def test_build_save_prompt_substitution(monkeypatch):
    with tempfile.TemporaryDirectory() as d:
        _make_template(d, "save-session.prompt.txt",
            "Time: {{TIME}}\nBranch: {{BRANCH}}\nLast: {{LAST_ENTRY}}\n{{EXTRACT}}")
        monkeypatch.setattr(prompts, "PROMPTS_DIR", d)

        result = prompts.build_save_prompt(
            time="10:30",
            branch="master",
            last_entry="did stuff",
            extract="[HUMAN] hello\n[AGENT] hi",
        )
        assert "Time: 10:30" in result
        assert "Branch: master" in result
        assert "Last: did stuff" in result
        assert "[HUMAN] hello" in result


def test_build_ndc_prompt_substitution(monkeypatch):
    with tempfile.TemporaryDirectory() as d:
        _make_template(d, "compress-ndc.prompt.txt",
            "Compress:\n{{NOW_CONTENT}}")
        monkeypatch.setattr(prompts, "PROMPTS_DIR", d)

        result = prompts.build_ndc_prompt("## 10:30 | did stuff\ndetails here")
        assert "## 10:30 | did stuff" in result
        assert "details here" in result


def test_build_consolidation_prompt(monkeypatch):
    with tempfile.TemporaryDirectory() as d:
        _make_template(d, "consolidate-staging.prompt.txt",
            "Staging:{{STAGING_FILES}}\nRecent:{{RECENT}}\nArchive:{{ARCHIVE}}")
        monkeypatch.setattr(prompts, "PROMPTS_DIR", d)

        result = prompts.build_consolidation_prompt(
            staging_contents={"today-2026-03-12.md": "stuff from yesterday"},
            recent="# Recent\nold",
            archive="# Archive\nolder",
        )
        assert "today-2026-03-12.md" in result
        assert "stuff from yesterday" in result
        assert "# Recent" in result
        assert "# Archive" in result


def test_build_save_prompt_with_real_templates():
    """Integration: verify the real template files load and substitute."""
    real_prompts = os.path.join(os.path.dirname(__file__), "..", "prompts")
    if not os.path.isdir(real_prompts):
        return  # skip if running outside repo
    result = prompts.build_save_prompt(
        time="10:00", branch="master", last_entry="test", extract="test"
    )
    assert "{{TIME}}" not in result
    assert "{{BRANCH}}" not in result


def test_read_template_nonexistent_file_raises(monkeypatch):
    """_read_template() raises FileNotFoundError when the template file doesn't exist."""
    with tempfile.TemporaryDirectory() as d:
        monkeypatch.setattr(prompts, "PROMPTS_DIR", d)
        with pytest.raises(FileNotFoundError):
            prompts._read_template("nonexistent.txt")


def test_build_save_prompt_extract_with_placeholder_literals(monkeypatch):
    """Regression: {{TIME}}/{{BRANCH}} in extract content must not break header substitution."""
    with tempfile.TemporaryDirectory() as d:
        _make_template(d, "save-session.prompt.txt",
            "Time: {{TIME}}\nBranch: {{BRANCH}}\nLast: {{LAST_ENTRY}}\n{{EXTRACT}}")
        monkeypatch.setattr(prompts, "PROMPTS_DIR", d)

        result = prompts.build_save_prompt(
            time="14:32",
            branch="infra/memory",
            last_entry="previous entry",
            extract="[HUMAN] The template uses {{TIME}} and {{BRANCH}} placeholders\n[ASSISTANT] Yes",
        )
        # Header placeholders substituted correctly
        assert "Time: 14:32" in result
        assert "Branch: infra/memory" in result
        # Extract content preserved verbatim (placeholders already consumed)
        assert "{{TIME}} and {{BRANCH}} placeholders" in result


def test_build_consolidation_prompt_empty_staging(monkeypatch):
    """build_consolidation_prompt() with empty staging_contents replaces {{STAGING_FILES}} with ''."""
    with tempfile.TemporaryDirectory() as d:
        _make_template(d, "consolidate-staging.prompt.txt",
            "Staging:{{STAGING_FILES}}\nRecent:{{RECENT}}\nArchive:{{ARCHIVE}}")
        monkeypatch.setattr(prompts, "PROMPTS_DIR", d)

        result = prompts.build_consolidation_prompt(
            staging_contents={},
            recent="# Recent\nnothing new",
            archive="# Archive\nold stuff",
        )
        assert "{{STAGING_FILES}}" not in result
        assert "Staging:\n" in result
        assert "# Recent" in result
        assert "# Archive" in result
