"""Tests for consolidation logic (response parsing — no real Haiku calls)."""

import os
import sys
from unittest.mock import patch, MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from pipeline.consolidate import parse_consolidation_response, consolidate
from pipeline.types import HaikuResult, TokenUsage, ConsolidationResult


def test_parse_both_sections():
    text = """===RECENT===
# Recent

## 2026-03-12
Built memory pipeline. Refactored shell scripts.

===ARCHIVE===
# Archive

## Week of 2026-03-09
Memory infra completion. Blog standardization."""

    recent, archive = parse_consolidation_response(text)
    assert recent.startswith("# Recent")
    assert "2026-03-12" in recent
    assert "memory pipeline" in recent
    assert archive.startswith("# Archive")
    assert "Week of 2026-03-09" in archive


def test_parse_recent_only():
    text = """===RECENT===
# Recent

## 2026-03-12
Did stuff."""

    recent, archive = parse_consolidation_response(text)
    assert "2026-03-12" in recent
    assert archive == ""


def test_parse_fallback_no_markers():
    text = "## 2026-03-12\nSome content without markers"
    recent, archive = parse_consolidation_response(text)
    assert "2026-03-12" in recent
    assert recent.startswith("# Recent")
    assert archive == ""


def test_parse_preserves_headers():
    text = """===RECENT===
# Recent

stuff

===ARCHIVE===
# Archive

more stuff"""

    recent, archive = parse_consolidation_response(text)
    assert recent.startswith("# Recent")
    assert archive.startswith("# Archive")


def test_parse_adds_missing_headers():
    text = """===RECENT===
## 2026-03-12
no header

===ARCHIVE===
## Week of 2026-03-09
also no header"""

    recent, archive = parse_consolidation_response(text)
    assert recent.startswith("# Recent")
    assert archive.startswith("# Archive")


def test_parse_empty_response():
    recent, archive = parse_consolidation_response("")
    assert archive == ""


def test_parse_identity_candidates():
    text = """===RECENT===
# Recent

## 2026-03-12
Built stuff.

## Identity Candidates
- IDENTITY CANDIDATE: Memory is identity

===ARCHIVE===
# Archive

old stuff"""

    recent, archive = parse_consolidation_response(text)
    assert "IDENTITY CANDIDATE" in recent
    assert "Memory is identity" in recent


def test_consolidate_returns_consolidation_result():
    """consolidate() wires prompt + haiku + parser into a ConsolidationResult."""
    fake_haiku_response = HaikuResult(
        text="===RECENT===\n# Recent\n\n## 2026-03-12\nDid things.\n\n===ARCHIVE===\n# Archive\n\nOld things.",
        tokens=TokenUsage(input=100, output=50, cache=0, cost_usd=0.0001),
    )
    with patch("pipeline.consolidate.call_haiku", return_value=fake_haiku_response):
        result = consolidate(
            staging_contents={"today-2026-03-12.md": "Did things."},
            recent="# Recent\n\nold recent",
            archive="# Archive\n\nold archive",
        )

    assert isinstance(result, ConsolidationResult)
    assert "2026-03-12" in result.recent
    assert "Old things" in result.archive
    assert result.tokens.input == 100


def test_parse_archive_only_marker_no_recent_marker():
    """===ARCHIVE=== without ===RECENT=== falls through to the else branch — entire text treated as recent."""
    text = "some content before\n===ARCHIVE===\n# Archive\narchive stuff"
    recent, archive = parse_consolidation_response(text)
    # No ===RECENT=== marker — full text lands in recent via else fallback
    assert "some content before" in recent
    assert recent.startswith("# Recent")
    # archive marker is not parsed without the RECENT marker present
    assert archive == ""


def test_parse_empty_sections_between_markers():
    """Markers present but nothing between them — both sections are empty strings."""
    text = "===RECENT===\n===ARCHIVE==="
    recent, archive = parse_consolidation_response(text)
    # Both sections strip to "" — headers are only added when content is non-empty
    assert recent == ""
    assert archive == ""
