#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Clone curated repos in parallel via gh-proxy.org, then revert to github.com URLs."""
import os
import subprocess
import sys
import io
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

AGENT_DIR = r"D:\doge-code\.github\agent"
PROXY_BASE = "https://gh-proxy.org"

CURATED_REPOS = [
    "punkpeye/awesome-mcp-servers",
    "headroomlabs-ai/headroom",
    "zylon-ai/private-gpt",
    "DeusData/codebase-memory-mcp",
    "github/github-mcp-server",
    "PrefectHQ/fastmcp",
    "googleapis/mcp-toolbox",
    "MODSetter/SurfSense",
    "GLips/Figma-Context-MCP",
    "awslabs/mcp",
    "wonderwhy-er/DesktopCommanderMCP",
    "yzfly/Awesome-MCP-ZH",
    "appcypher/awesome-mcp-servers",
    "executeautomation/mcp-playwright",
    "sooperset/mcp-atlassian",
    "nanbingxyz/5ire",
    "Coding-Solo/godot-mcp",
    "openclaw/Peekaboo",
    "modelcontextprotocol/go-sdk",
    "modelcontextprotocol/registry",
    "agent-infra/sandbox",
    "casdoor/casdoor",
    "webiny/webiny-js",
]


def clone_one(repo_full_name):
    name = repo_full_name.split('/')[-1]
    repo_url = f"https://github.com/{repo_full_name}.git"
    proxy_url = f"{PROXY_BASE}/{repo_url}"
    dest = os.path.join(AGENT_DIR, name)

    if os.path.isdir(dest) and os.listdir(dest):
        return (name, "SKIP", "")

    os.makedirs(AGENT_DIR, exist_ok=True)

    for label, url in [("proxy", proxy_url), ("direct", repo_url)]:
        try:
            result = subprocess.run(
                ['git', 'clone', '--depth', '1', '--single-branch', url, dest],
                capture_output=True, text=True, timeout=120,
            )
            if result.returncode == 0:
                return (name, "OK(proxy)" if label == "proxy" else "OK(direct)", "")
        except subprocess.TimeoutExpired:
            pass
        except Exception as e:
            return (name, "FAIL", str(e)[:80])

    return (name, "FAIL", "timeout or error")


def revert_remotes():
    n = 0
    for item in os.listdir(AGENT_DIR):
        git_config = os.path.join(AGENT_DIR, item, '.git', 'config')
        if not os.path.isfile(git_config):
            continue
        with open(git_config, 'r', encoding='utf-8') as f:
            content = f.read()
        if 'gh-proxy.org' in content:
            new_content = content.replace('gh-proxy.org/https://github.com', 'github.com')
            with open(git_config, 'w', encoding='utf-8') as f:
                f.write(new_content)
            n += 1
    return n


def main():
    print("=== doge-code 并行克隆知名仓库 ===\n")
    os.makedirs(AGENT_DIR, exist_ok=True)

    existing = set()
    for item in os.listdir(AGENT_DIR):
        if os.path.isdir(os.path.join(AGENT_DIR, item)):
            existing.add(item.lower())

    to_clone = [r for r in CURATED_REPOS if r.split('/')[-1].lower() not in existing]
    skipped = [r for r in CURATED_REPOS if r.split('/')[-1].lower() in existing]

    print(f"Already exist: {len(skipped)}")
    print(f"To clone: {len(to_clone)}")
    for r in to_clone:
        print(f"  -> {r}")

    print(f"\nCloning (8 parallel workers)...\n")
    success = 0
    failed = []
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {pool.submit(clone_one, r): r for r in to_clone}
        done = 0
        for future in as_completed(futures):
            name, status, err = future.result()
            done += 1
            if status.startswith("OK"):
                success += 1
            elif status == "FAIL":
                failed.append(futures[future])
            print(f"  [{done}/{len(to_clone)}] {status} {name}")
            sys.stdout.flush()

    print(f"\n=== Result: {success} success, {len(failed)} fail, {len(skipped)} skip ===")

    if success > 0:
        n = revert_remotes()
        print(f"Reverted {n} repos remote URL to github.com")

    dirs = [d for d in os.listdir(AGENT_DIR)
            if os.path.isdir(os.path.join(AGENT_DIR, d))]
    print(f"Total dirs in agent/: {len(dirs)}")


if __name__ == "__main__":
    main()
