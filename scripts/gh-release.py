"""查询 GitHub 仓库最新 release 及下载资源。

用法: python scripts/gh-release.py <owner/repo> [过滤关键词]
"""
import json
import sys
import urllib.request

sys.stdout.reconfigure(encoding='utf-8', errors='replace')


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return
    repo = sys.argv[1]
    filt = sys.argv[2].lower() if len(sys.argv) > 2 else ''
    url = 'https://api.github.com/repos/%s/releases/latest' % repo
    req = urllib.request.Request(url, headers={
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'update-check',
    })
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            d = json.load(r)
    except Exception as e:
        print('ERROR: %s' % e)
        return
    print('=== %s ===' % repo)
    print('tag      : %s' % d.get('tag_name'))
    print('published: %s' % d.get('published_at'))
    print('')
    for a in d.get('assets', []):
        n = a['name']
        if filt and filt not in n.lower():
            continue
        print('%-52s %12d' % (n, a['size']))
        print('   %s' % a['browser_download_url'])


if __name__ == '__main__':
    main()
