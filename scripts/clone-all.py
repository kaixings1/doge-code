#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Clone high-star MCP/AI-agent/skill repos for doge-code.

Absorbs features from:
  - search_high_star.py : GitHub search queries + keyword filtering
  - clone_top_repos.py  : curated high-star repo list
  - search_targeted.py  : targeted search queries
  - batch_clone.py      : proxy-first then direct-fallback clone pattern

Workflow:
  1. Download via gh-proxy.org first (proxy).
  2. Fall back to the original github.com URL if the proxy fails.
  3. Skip repos already present (case-insensitive name match).
"""
import json
import os
import subprocess
import sys
import time
import io
import urllib.request
import urllib.parse

# Fix encoding for Windows console
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

# ── Configuration ────────────────────────────────────────────────
AGENT_DIR = r"D:\doge-code\.github\agent"
REPO_LIST_FILE = r"D:\doge-code\temp\_top100_repos.json"
ALL_REPOS_FILE = r"D:\doge-code\temp\all_agent_repos_1500.json"

# Comprehensive search queries (absorbed from search_high_star.py)
SEARCH_QUERIES = [
    # MCP servers
    "mcp server stars:>100",
    "mcp-server stars:>100",
    "model context protocol stars:>100",
    "browser automation mcp stars:>100",
    "playwright mcp stars:>50",
    # Claude Code skills/agents
    "claude code skills stars:>50",
    "claude-code-skills stars:>50",
    "claude agent skills stars:>50",
    "claude skills stars:>50",
    "claude agents stars:>100",
    "claude code plugins stars:>50",
    # AI agent frameworks
    "ai agent framework stars:>100",
    "llm agent framework stars:>100",
    "autonomous agent stars:>100",
    # Skills collections
    "skills collection ai stars:>50",
    "ai skills stars:>50",
]

# Curated top-starred repos (absorbed from clone_top_repos.py)
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

# Keyword filter for relevance (absorbed from search_high_star.py)
KEYWORDS = [
    'mcp', 'skill', 'claude', 'agent', 'playwright', 'browser', 'pywin',
    'win', 'mfc', 'langchain', 'langgraph', 'autogen', 'crew', 'gemini',
    'codex', 'cursor', 'everything', 'awesome', 'framework', 'llm',
]

GITHUB_API = "https://api.github.com/search/repositories"
PROXY_BASE = "https://gh-proxy.org"


def search_github(query, max_pages=3):
    """Search GitHub API, return list of (full_name, stars)."""
    results = []
    for page in range(1, max_pages + 1):
        url = f"{GITHUB_API}?q={urllib.parse.quote(query)}&sort=stars&per_page=100&page={page}"
        try:
            req = urllib.request.Request(
                url,
                headers={
                    'User-Agent': 'Mozilla/5.0',
                    'Accept': 'application/vnd.github.v3+json',
                },
            )
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = json.loads(resp.read())
                for item in data.get('items', []):
                    results.append((item['full_name'], item['stargazers_count']))
        except Exception as e:
            print(f"  [ERR] page {page}: {e}")
        time.sleep(0.5)
    return results


def clone_repo(repo, existing):
    """Clone a repo via proxy, fall back to direct URL. Skip if present."""
    name = repo.split('/')[-1]
    if name.lower() in existing:
        return "SKIP"

    repo_url = f"https://github.com/{repo}.git"
    clone_url = f"{PROXY_BASE}/{repo_url}"

    urls = [clone_url, repo_url]  # proxy first, then direct (original repo URL)

    for i, url in enumerate(urls):
        label = "proxy" if i == 0 else "direct"
        try:
            result = subprocess.run(
                ['git', 'clone', '--depth', '1', '--single-branch', url, name],
                cwd=AGENT_DIR,
                capture_output=True,
                text=True,
                timeout=120,
            )
            if result.returncode == 0:
                return "OK" if label == "proxy" else f"OK(direct)"
        except subprocess.TimeoutExpired:
            print(f"  [{label}] TIMEOUT for {name}")
        except Exception as e:
            print(f"  [{label}] ERROR: {str(e)[:100]}")

    return "FAIL"


def load_existing():
    """Get existing repo dir names (case-insensitive set)."""
    os.makedirs(AGENT_DIR, exist_ok=True)
    existing = set()
    for item in os.listdir(AGENT_DIR):
        if os.path.isdir(os.path.join(AGENT_DIR, item)):
            existing.add(item.lower())
    return existing


def build_repo_list():
    """Build the repo list: curated + search results + existing JSON."""
    found = set()

    # 1. Curated repos
    for repo in CURATED_REPOS:
        found.add((repo, 999999))

    # 2. GitHub search results
    for q in SEARCH_QUERIES:
        print(f"Query: {q}")
        results = search_github(q, max_pages=3)
        for full_name, stars in results:
            found.add((full_name, stars))
        time.sleep(1)

    # 3. Existing JSON file (from batch_clone_1500.py)
    if os.path.exists(ALL_REPOS_FILE):
        with open(ALL_REPOS_FILE, 'r', encoding='utf-8') as f:
            for repo in json.load(f):
                found.add((f"{repo['owner']}/{repo['name']}", repo['stars']))

    # 4. Top100 file if present
    if os.path.exists(REPO_LIST_FILE):
        try:
            with open(REPO_LIST_FILE, 'r', encoding='utf-8') as f:
                for repo in json.load(f):
                    if isinstance(repo, dict) and 'name' in repo:
                        found.add((f"{repo['owner']}/{repo['name']}", repo.get('stars', 0)))
        except Exception:
            pass

    # Deduplicate and filter by keywords
    seen = set()
    unique = []
    for full_name, stars in found:
        key = full_name.lower()
        if key in seen:
            continue
        seen.add(key)
        # Filter: only repos whose name/description matches keywords
        name_part = full_name.lower()
        if any(k in name_part for k in KEYWORDS):
            unique.append((full_name, stars))

    # Sort by stars descending
    unique.sort(key=lambda x: x[1], reverse=True)
    return unique


def parse_args():
    import argparse
    parser = argparse.ArgumentParser(description='Clone high-star MCP/AI-agent repos')
    parser.add_argument('count', nargs='?', type=int, default=0,
                        help='Max repos to clone (default: all)')
    parser.add_argument('--update', '-u', action='store_true',
                        help='Pull latest for existing repos instead of skipping')
    return parser.parse_args()


def update_repo(repo):
    """git pull for an existing repo. Returns 'OK', 'FAIL', or 'SKIP'."""
    name = repo.split('/')[-1]
    repo_dir = os.path.join(AGENT_DIR, name)
    if not os.path.isdir(repo_dir):
        return "SKIP"
    try:
        result = subprocess.run(
            ['git', 'pull', '--ff-only'],
            cwd=repo_dir,
            capture_output=True,
            text=True,
            timeout=60,
        )
        if result.returncode == 0:
            return "OK"
        else:
            err = result.stderr.strip()[:80]
            print(f"  [pull] FAIL: {err}")
            return "FAIL"
    except subprocess.TimeoutExpired:
        print(f"  [pull] TIMEOUT for {name}")
        return "FAIL"
    except Exception as e:
        print(f"  [pull] ERROR: {str(e)[:100]}")
        return "FAIL"


def main():
    args = parse_args()
    count = args.count
    update_mode = args.update

    mode_label = "更新（git pull）" if update_mode else "克隆"
    print(f"=== doge-code repo {mode_label} tool ===\n")
    print(f"Target dir: {AGENT_DIR}")

    existing = load_existing()
    print(f"Already downloaded: {len(existing)} repos\n")

    repos = build_repo_list()
    print(f"\nTotal unique relevant repos: {len(repos)}")

    if count > 0:
        repos = repos[:count]
        print(f"Limited to top {count} by stars")

    print(f"Top 10 by stars:")
    for _, (name, stars) in enumerate(repos[:10], 1):
        print(f"  {stars:>7,} | {name}")

    print(f"\n{mode_label}...")
    success = 0
    skipped = 0
    failed = 0

    for repo, stars in repos:
        if update_mode:
            result = update_repo(repo)
            name = repo.split('/')[-1]
            if result == "SKIP":
                skipped += 1
            elif result.startswith("OK"):
                success += 1
            else:
                failed += 1
            print(f"  [{result}] {repo} ({stars:,} stars)")
        else:
            result = clone_repo(repo, existing)
            name = repo.split('/')[-1]
            if result == "SKIP":
                skipped += 1
            elif result.startswith("OK"):
                success += 1
            else:
                failed += 1
            print(f"  [{result}] {repo} ({stars:,} stars)")
        time.sleep(0.3)

    print(f"\n{'=' * 60}")
    print(f"FINAL SUMMARY ({mode_label}):")
    print(f"  Success: {success}")
    print(f"  Skipped: {skipped}")
    print(f"  Failed: {failed}")
    dirs = [d for d in os.listdir(AGENT_DIR) if os.path.isdir(os.path.join(AGENT_DIR, d))]
    print(f"  Total dirs in agent/: {len(dirs)}")


if __name__ == "__main__":
    main()
