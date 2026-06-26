"""Tests for pipeline/__main__.py entry point."""

import os
import sys
from unittest.mock import patch

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


def test_main_module_no_args_exits_1():
    """Running python3 -m pipeline with no submodule argument exits with code 1."""
    with patch("sys.argv", ["pipeline"]):
        with pytest.raises(SystemExit) as exc:
            import pipeline.__main__  # noqa: F401 — importing triggers the top-level code
    assert exc.value.code == 1


def test_main_module_prints_usage_to_stderr(capsys):
    """Error message is printed to stderr before exiting."""
    with patch("sys.argv", ["pipeline"]):
        with pytest.raises(SystemExit):
            # Re-execute the module body by running its source directly
            import importlib
            import pipeline.__main__ as m
            importlib.reload(m)
    err = capsys.readouterr().err
    assert "Usage" in err
    assert "pipeline" in err
