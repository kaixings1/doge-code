#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Clone curated repos in parallel via gh-proxy.org, then revert to github.com URLs."""
import json
import os
import subprocess
import sys
import time
import io
import urllib.request
import urllib.parse
from concurrent.futures import ThreadPoolExecutor, as_completed

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

AGENT_DIR = r"D:\doge-code\.github\agent"
PROXY_BASE = "https://gh-proxy.org"
GITHUB_API = "https://api.github.com/search/repositories"

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

KEYWORDS = [
    'mcp', 'skill', 'claude', 'agent', 'playwright', 'browser', 'pywin',
    'win', 'mfc', 'langchain', 'langgraph', 'autogen', 'crew', 'gemini',
    'codex', 'cursor', 'everything', 'awesome', 'framework', 'llm',
]

SEARCH_QUERIES = [
    "mcp server stars:>100",
    "mcp-server stars:>100",
    "model context protocol stars:>100",
    "browser automation mcp stars:>100",
    "playwright mcp stars:>50",
    "claude code skills stars:>50",
    "claude-code-skills stars:>50",
    "claude agent skills stars:>50",
    "claude skills stars:>50",
    "claude agents stars:>100",
    "claude code plugins stars:>50",
    "ai agent framework stars:>100",
    "llm agent framework stars:>100",
    "autonomous agent stars:>100",
    "skills collection ai stars:>50",
    "ai skills stars:>50",
]


def search_github(query, max_pages=2):
    """Search GitHub API, return list of (full_name, stars)."""
    results = []
    for page in range(1, max_pages + 1):
        url = f"{GITHUB_API}?q={urllib.parse.quote(query)}&sort=stars&per_page=50&page={page}"
        try:
            req = urllib.request.Request(url, headers={
                'User-Agent': 'Mozilla/5.0',
                'Accept': 'application/vnd.github.v3+json',
            })
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = json.loads(resp.read())
                for item in data.get('items', []):
                    results.append((item['full_name'], item['stargazers_count']))
        except Exception as e:
            print(f"  [ERR] search '{query}' page {page}: {e}")
        time.sleep(0.5)
    return results


def build_repo_list():
    """Build full repo list: curated + GitHub search, filtered by keywords."""
    found = set()
    for repo in CURATED_REPOS:
        found.add((repo, 999999))

    for q in SEARCH_QUERIES:
        results = search_github(q)
        for full_name, stars in results:
            found.add((full_name, stars))
        time.sleep(0.3)

    seen = set()
    unique = []
    for full_name, stars in found:
        key = full_name.lower()
        if key in seen:
            continue
        seen.add(key)
        name_part = full_name.lower()
        if any(k in name_part for k in KEYWORDS):
            unique.append((full_name, stars))

    unique.sort(key=lambda x: x[1], reverse=True)
    return unique


def clone_one(repo_full_name):
    """Clone a single repo via proxy, return (name, status)."""
    name = repo_full_name.split('/')[-1]
    repo_url = f"https://github.com/{repo_full_name}.git"
    proxy_url = f"{PROXY_BASE}/{repo_url}"
    dest = os.path.join(AGENT_DIR, name)

    if os.path.isdir(dest) and os.listdir(dest):
        return (name, "SKIP")

    os.makedirs(AGENT_DIR, exist_ok=True)

    for label, url in [("proxy", proxy_url), ("direct", repo_url)]:
        try:
            result = subprocess.run(
                ['git', 'clone', '--depth', '1', '--single-branch', url, dest],
                capture_output=True, text=True, timeout=120,
            )
            if result.returncode == 0:
                return (name, "OK(proxy)" if label == "proxy" else "OK(direct)")
        except subprocess.TimeoutExpired:
            pass
        except Exception as e:
            pass

    return (name, "FAIL")


def revert_remotes():
    """Revert all clone URLs from gh-proxy back to github.com."""
    reverted = 0
    for item in os.listdir(AGENT_DIR):
        repo_dir = os.path.join(AGENT_DIR, item)
        git_config = os.path.join(repo_dir, '.git', 'config')
        if not os.path.isfile(git_config):
            continue
        with open(git_config, 'r', encoding='utf-8') as f:
            content = f.read()
        if 'gh-proxy.org' in content:
            new_content = content.replace('gh-proxy.org/https://github.com', 'github.com')
            with open(git_config, 'w', encoding='utf-8') as f:
                f.write(new_content)
            reverted += 1
    return reverted


def main():
    print("=== doge-code 并行克隆知名仓库 ===\n")
    os.makedirs(AGENT_DIR, exist_ok=True)

    print("Building repo list (curated + search)...")
    repos = build_repo_list()
    print(f"Total repos to consider: {len(repos)}")

    # Deduplicate with existing dirs
    existing = set()
    for item in os.listdir(AGENT_DIR):
        if os.path.isdir(os.path.join(AGENT_DIR, item)):
            existing.add(item.lower())

    to_clone = []
    skipped = []
    for full_name, stars in repos:
        name = full_name.split('/')[-1]
        if name.lower() in existing:
            skipped.append((full_name, stars))
        else:
            to_clone.append((full_name, stars))

    print(f"Already exist: {len(skipped)}")
    print(f"To clone: {len(to_clone)}\n")
    print("Top repos:")
    for _, (name, stars) in enumerate(to_clone[:15], 1):
        print(f"  {stars:>7,} | {name}")

    print("\nCloning (max 8 parallel)...")
    success = 0
    failed = []
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {pool.submit(clone_one, repo): repo for repo, _ in to_clone}
        for i, future in enumerate(as_completed(futures), 1):
            name, status = future.result()
            if status.startswith("OK"):
                success += 1
                print(f"  [{status}] {name}")
            elif status == "FAIL":
                failed.append(futures[future])
                print(f"  [FAIL] {name}")
            else:
                print(f"  [SKIP] {name}")
            if i % 20 == 0:
                print(f"  ... {i}/{len(to_clone)} done")

    print(f"\n=== 克隆完成: {success} success, {len(failed)} failed, {len(skipped)} skipped ===")

    if success > 0:
        print("\nReverting remote URLs to github.com...")
        n = revert_remotes()
        print(f"  Reverted {n} repos to github.com")

    dirs = [d for d in os.listdir(AGENT_DIR)
            if os.path.isdir(os.path.join(AGENT_DIR, d))]
    print(f"\nTotal dirs in agent/: {len(dirs)}")


if __name__ == "__main__":
    main()
