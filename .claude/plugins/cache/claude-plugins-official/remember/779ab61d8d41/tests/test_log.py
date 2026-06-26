"""Tests for pipeline logging."""

import os
import sys
import tempfile
from unittest.mock import patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from pipeline.log import log, log_tokens, format_duration
from pipeline.types import TokenUsage


def test_log_creates_file_and_writes():
    with tempfile.TemporaryDirectory() as d:
        log("test", "hello world", d)
        files = os.listdir(d)
        assert len(files) == 1
        assert files[0].startswith("memory-")
        content = open(os.path.join(d, files[0])).read()
        assert "[test] hello world" in content


def test_log_appends():
    with tempfile.TemporaryDirectory() as d:
        log("a", "first", d)
        log("b", "second", d)
        files = os.listdir(d)
        assert len(files) == 1
        content = open(os.path.join(d, files[0])).read()
        assert "[a] first" in content
        assert "[b] second" in content


def test_log_tokens_format():
    with tempfile.TemporaryDirectory() as d:
        usage = TokenUsage(input=1000, output=200, cache=500, cost_usd=0.0012)
        log_tokens("save", usage, d)
        files = os.listdir(d)
        content = open(os.path.join(d, files[0])).read()
        assert "[save] tokens:" in content
        assert "1000+500cache" in content


def test_format_duration_seconds():
    assert format_duration(0) == "0s"
    assert format_duration(42) == "42s"
    assert format_duration(59) == "59s"


def test_format_duration_minutes():
    assert format_duration(60) == "1m"
    assert format_duration(114) == "1m54s"
    assert format_duration(600) == "10m"


def test_format_duration_hours():
    assert format_duration(3600) == "1h"
    assert format_duration(11460) == "3h11m"
    assert format_duration(7200) == "2h"


def test_log_fallback_to_stderr_on_oserror(capsys):
    """When the log file can't be written, log() prints to stderr instead of raising."""
    with tempfile.TemporaryDirectory() as d:
        with patch("pipeline.log.open", side_effect=OSError("disk full")):
            log("test", "fallback message", d)

    captured = capsys.readouterr()
    assert "[test] fallback message" in captured.err


def test_log_tokens_with_nonzero_cost():
    """log_tokens() includes the $ cost in the output when cost_usd is non-zero."""
    with tempfile.TemporaryDirectory() as d:
        usage = TokenUsage(input=500, output=100, cache=0, cost_usd=0.0042)
        log_tokens("consolidate", usage, d)
        files = os.listdir(d)
        content = open(os.path.join(d, files[0])).read()
        assert "[consolidate] tokens:" in content
        assert "$0.0042" in content


def test_log_tokens_with_zero_cost():
    """log_tokens() still formats correctly when cost_usd is 0.0 (the default)."""
    with tempfile.TemporaryDirectory() as d:
        usage = TokenUsage(input=300, output=80, cache=50)
        log_tokens("save", usage, d)
        files = os.listdir(d)
        content = open(os.path.join(d, files[0])).read()
        assert "[save] tokens:" in content
        assert "$0.0000" in content
