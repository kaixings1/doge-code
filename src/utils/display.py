#!/usr/bin/env python3
import json
from pathlib import Path

CONFIG_PATH = Path(__file__).parent.parent / "config" / "display_config.json"

def load_config():
    if CONFIG_PATH.exists():
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"enable_emoji": True, "emoji_map": {}}

CONFIG = load_config()

def print_message(message_type: str, content: str):
    """输出带emoji的消息给用户"""
    if CONFIG.get("enable_emoji", True):
        emoji = CONFIG.get("emoji_map", {}).get(message_type, "")
        print(f"{emoji} {content}")
    else:
        print(content)

def print_success(content: str):
    print_message("success", content)

def print_error(content: str):
    print_message("error", content)

def print_warning(content: str):
    print_message("warning", content)

def print_info(content: str):
    print_message("info", content)

def print_prompt(content: str):
    print_message("prompt", content)

def print_loading(content: str):
    print_message("loading", content)
