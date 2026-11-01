"""从 GitHub 搜索仓库并按 star 排序输出。

用法: python scripts/gh-search.py "查询词" [数量]
"""
import json
import sys
import urllib.request
import urllib.parse

sys.stdout.reconfigure(encoding='utf-8', errors='replace')


def main():
    q = sys.argv[1] if len(sys.argv) > 1 else 'reverse engineering'
    n = int(sys.argv[2]) if len(sys.argv) > 2 else 10
    url = 'https://api.github.com/search/repositories?q=%s&sort=stars&order=desc&per_page=%d' % (
        urllib.parse.quote(q), n)
    req = urllib.request.Request(url, headers={
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'update-check',
    })
    try:
        with urllib.request.urlopen(req, timeout=25) as r:
            data = json.load(r)
    except Exception as e:
        print('ERROR: %s' % e)
        return
    print('=== query: %s  (total %d) ===' % (q, data.get('total_count', 0)))
    for r in data.get('items', []):
        desc = (r.get('description') or '').replace('\n', ' ')
        print('')
        print('%-46s  %8d stars  %s' % (r['full_name'], r['stargazers_count'], r.get('language') or ''))
        print('  %s' % desc[:150])
        print('  %s' % r['html_url'])


if __name__ == '__main__':
    main()
