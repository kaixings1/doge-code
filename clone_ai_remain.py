#!/usr/bin/env python3
# 续传剩余缺失的高星 AI 仓库（浅克隆 --depth 1，经 gh-proxy.org 代理）
# 每下载若干仓库检查一次磁盘空间，低于阈值即中止，避免再次写满。
import subprocess, os, sys, json, threading, shutil
from concurrent.futures import ThreadPoolExecutor, as_completed

sys.stdout.reconfigure(encoding='utf-8')

BASE = r'E:\doge-code\.github'
LIST = r'D:\doge-code\.tmp_absent.txt'
MIN_FREE_GB = 5  # 剩余空间低于此值即停止

with open(LIST, encoding='utf-8') as f:
    REPOS = [l.strip() for l in f if l.strip()]
print(f'待续传: {len(REPOS)} 个仓库', flush=True)

PROXIES = [
    'https://gh-proxy.org/https://github.com/{}.git',
    'https://github.com/{}.git',
]
lock = threading.Lock()
stats = {'ok': 0, 'skip': 0, 'fail': 0, 'nospace': 0}
failed = []
stop = threading.Event()

def free_gb():
    try:
        return shutil.disk_usage(BASE).free / (1024 ** 3)
    except Exception:
        return 999

def clone(repo):
    if stop.is_set():
        return 'STOPPed'
    dir_name = repo.replace('/', '-')
    target = os.path.join(BASE, dir_name)
    if os.path.exists(target):
        return 'EXISTS'
    for tpl in PROXIES:
        url = tpl.format(repo)
        try:
            r = subprocess.run(
                ['git', 'clone', '--depth', '1', url, target],
                capture_output=True, text=True, timeout=300,
                encoding='utf-8', errors='replace',
            )
            if r.returncode == 0:
                return 'OK'
            err = (r.stderr or '')
            if os.path.exists(target) and not os.path.isdir(os.path.join(target, '.git')):
                shutil.rmtree(target, ignore_errors=True)
            if 'No space left' in err or 'disk full' in err.lower():
                return 'NOSPACE'
        except Exception:
            if os.path.exists(target) and not os.path.isdir(os.path.join(target, '.git')):
                shutil.rmtree(target, ignore_errors=True)
    return 'FAIL'

done = 0
with ThreadPoolExecutor(max_workers=8) as pool:
    futs = {pool.submit(clone, r): r for r in REPOS}
    for fut in as_completed(futs):
        repo = futs[fut]
        try:
            res = fut.result()
        except Exception:
            res = 'FAIL'
        with lock:
            done += 1
            if res == 'OK':
                stats['ok'] += 1
            elif res == 'EXISTS':
                stats['skip'] += 1
            elif res == 'NOSPACE':
                stats['nospace'] += 1
                failed.append(repo)
                stop.set()
            else:
                stats['fail'] += 1
                failed.append(repo)
            if done % 10 == 0 or done == len(REPOS):
                print(f'[{done}/{len(REPOS)}] ok={stats["ok"]} skip={stats["skip"]} '
                      f'fail={stats["fail"]} nospace={stats["nospace"]} free={free_gb():.1f}G', flush=True)

with open(r'D:\doge-code\.tmp_clone_failed2.txt', 'w', encoding='utf-8') as f:
    f.write('\n'.join(failed))
print(f'\n完成: ok={stats["ok"]} skip={stats["skip"]} fail={stats["fail"]} nospace={stats["nospace"]}', flush=True)
print(f'剩余空间: {free_gb():.1f} GB', flush=True)
if failed:
    print(f'失败清单: {len(failed)} 个 -> D:\\doge-code\\.tmp_clone_failed2.txt', flush=True)
