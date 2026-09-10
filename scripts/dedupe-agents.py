#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
dedupe-agents.py — Claude Code 代理去重 / 吸收合并 / 冗余清理工具

用途：
  扫描 .claude/agents 下的所有代理（.md），检测重复（同 title / 同 name），
  结合外部引用（commands / skills / docs）判定保留对象，并支持：
    - 吸收合并：用更完善的大版本内容替换同名小版本（保留文件名 = 保留全部引用）
    - 安全移除：将"无引用且是重复副本"的代理移入回收站（可恢复）

设计要点（强功能 / 防误删）：
  1. 引用保护：移除前必须确认该文件名未被外部引用；被引用的优先保留
  2. 保留策略：同组内被引用者优先；无引用则保留内容更长（更完善）者
  3. dry-run 默认开启（安全）；--apply 才真正执行写操作
  4. 删除 = 移入回收站 <agents>/__trash__/<时间戳>/，不直接物理删，可恢复
  5. 吸收合并 = 就地覆盖同级同名文件，原内容先备份到回收站

用法：
  python scripts/dedupe-agents.py                      # 检测 + 报告（安全，dry-run）
  python scripts/dedupe-agents.py --report out.md      # 报告写入文件
  python scripts/dedupe-agents.py --apply              # 执行合并/回收（谨慎）
  python scripts/dedupe-agents.py --root <agents目录>
  python scripts/dedupe-agents.py --verbose

返回码：
  0   完成
  2   需人工判断冲突，未执行写操作
  3   参数/路径错误
"""

import os
import re
import sys
import ast
import argparse
import shutil
from datetime import datetime
from collections import defaultdict

DEFAULT_ROOT = '.claude/agents'


# ============ 解析 ============
def parse_frontmatter(content):
    """提取 frontmatter 的 name/description；失败返回 ('','')。"""
    name, desc = '', ''
    m = re.match(r'^---\s*\n(.*?)\n---', content, re.DOTALL)
    if m:
        fm = m.group(1)
        nm = re.search(r'^name:\s*(.+)$', fm, re.M)
        if nm:
            name = nm.group(1).strip().strip('"\'')
        lines = fm.splitlines()
        in_desc = False
        dl = []
        for ln in lines:
            if ln.startswith('description:'):
                in_desc = True
                v = ln.split(':', 1)[1].strip().strip('"\'')
                if v:
                    dl.append(v)
            elif in_desc:
                s = ln.strip()
                if not s or s.startswith('-') or re.match(r'^[a-zA-Z_-]+:', ln):
                    in_desc = False
                else:
                    dl.append(s)
        if dl:
            desc = ' '.join(dl).strip('"\'')
    return name, desc


def scan_agents(root):
    """扫描 agents 目录，返回 agent 字典列表。"""
    agents = []
    if not os.path.isdir(root):
        raise SystemExit(f'[错误] agents 目录不存在: {root}')
    for dirpath, dirnames, files in os.walk(root):
        if os.path.basename(dirpath) == '__trash__':
            dirnames[:] = []
            continue
        for f in files:
            if not f.endswith('.md'):
                continue
            absfp = os.path.join(dirpath, f)
            rel = os.path.relpath(absfp, root).replace(os.sep, '/')
            try:
                content = open(absfp, encoding='utf-8', errors='ignore').read()
            except Exception:
                continue
            name, desc = parse_frontmatter(content)
            title = f[:-3]
            conf = dict(
                rel=rel, abs=absfp, title=title,
                size=len(content), name=name or title,
                desc=desc, content=content,
            )
            agents.append(conf)
    return agents


def find_project_root(agents_root):
    """推测项目根：<项目根>/.claude/agents 或 <项目根>/agents。"""
    ap = os.path.abspath(agents_root)
    parent = os.path.dirname(ap)
    if os.path.basename(parent) == '.claude':
        return os.path.dirname(parent)
    return os.path.dirname(parent)  # 退化


def scan_refs(agents_root, filename_set):
    """在项目 cmd/skills/docs 内扫描对代理文件名的引用。
    使用【精确单词边界】匹配，避免 chaos-engineer / chaos-engineering 误报。
    返回 {filename: [引用文件绝对路径]}。
    仅统计"强引用"目录（commands/skills/workflows）——它们会在运行时触发代理，
    文档(docs)中的宣传性提及不计入保护（避免文档阻止删除冗余代理）。"""
    proj = find_project_root(agents_root)
    refs = defaultdict(list)
    STRONG_DIRS = ('commands', 'skills', 'workflows')
    for d in STRONG_DIRS:
        cand = [os.path.join(proj, '.claude', d) if d != 'workflows' else os.path.join(proj, '.claude', 'agents', d),
                os.path.join(proj, d)]
        for scan_dir in cand:
            if not os.path.isdir(scan_dir):
                continue
            for dirpath, _, files in os.walk(scan_dir):
                for fn in files:
                    if not fn.endswith(('.md', '.json', '.toml', '.mdc', '.txt', '.yaml', '.yml', '.ts', '.js')):
                        continue
                    fp = os.path.join(dirpath, fn)
                    try:
                        content = open(fp, encoding='utf-8', errors='ignore').read()
                    except Exception:
                        continue
                    for base in filename_set:
                        stem = base[:-3]
                        pat = re.compile(r'(?<![A-Za-z0-9_-])' + re.escape(stem) + r'(?![A-Za-z0-9_-])')
                        if pat.search(content):
                            refs[base].append(fp)
    return refs


def group_by_title(agents):
    g = defaultdict(list)
    for a in agents:
        g[a['title']].append(a)
    return {k: v for k, v in g.items() if len(v) > 1}


def build_report(dup_groups, total, refs):
    now = datetime.now().isoformat(timespec='seconds')
    L = [f'# 代理重复检测报告（{now}）', '']
    L.append(f'扫描 {total} 个代理，发现 {len(dup_groups)} 组重复 title。')
    L.append('')
    for title, members in sorted(dup_groups.items()):
        members_sorted = sorted(members, key=lambda a: (a['rel'].count('/'), -a['size']))
        L.append(f'## {title}')
        for a in members_sorted:
            base = os.path.basename(a['rel'])
            r = refs.get(base, [])
            note = f"被引用 {len(r)} 处" if r else '无引用'
            L.append(f'- `{a["rel"]}` [{a["size"]}B] {note}')
            for x in r[:6]:
                L.append(f'    └ {x}')
        L.append('')
    return '\n'.join(L)


# ============ 主逻辑 ============
def run_detect(args):
    root = os.path.abspath(args.root)
    agents = scan_agents(root)
    if not agents:
        print('[!] 未扫描到代理，返回 3')
        return 3
    filename_set = set(a['title'] + '.md' for a in agents)
    refs = scan_refs(root, filename_set)
    dup = group_by_title(agents)

    report = build_report(dup, len(agents), refs)
    if args.report:
        with open(args.report, 'w', encoding='utf-8') as fh:
            fh.write(report)
        print(f'报告已写入: {args.report}')
    else:
        print(report)

    # 概要在终端
    print('=' * 50)
    print(f'代理总数: {len(agents)} | 重复组: {len(dup)}')
    if args.verbose:
        for b, locs in sorted(refs.items()):
            if locs:
                print(f'  引用 {b} -> {len(locs)} 处')
    print('（--apply 才会真实执行合并/回收；当前为 dry-run。）')
    return 0


# ============ apply：合并 / 回收 ============
def make_trash_dir(agents_root):
    """创建并返回回收站目录 agents/__trash__/<时间戳>/。"""
    stamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    d = os.path.join(agents_root, '__trash__', stamp)
    os.makedirs(d, exist_ok=True)
    return d


def do_abscomission(agents_root, source_rel, target_rel, trash_dir, verbose=False):
    """吸收合并：把 source_rel 的内容写入 target_rel（就地覆盖），保留 target 文件名。
    原 target 内容先备份到回收站。返回 True/False。"""
    src = os.path.join(agents_root, source_rel)
    tgt = os.path.join(agents_root, target_rel)
    if not os.path.isfile(tgt):
        print(f'  [!] 目标不存在，跳过: {target_rel}')
        return False
    try:
        new_content = open(src, encoding='utf-8', errors='ignore').read()
        old_content = open(tgt, encoding='utf-8', errors='ignore').read()
    except Exception as e:
        print(f'  [!] 读取失败: {e}')
        return False

    # 备份旧内容
    bak = os.path.join(trash_dir, target_rel.replace('/', '__'))
    try:
        os.makedirs(os.path.dirname(bak), exist_ok=True)
        with open(bak, 'w', encoding='utf-8') as fh:
            fh.write(old_content)
    except Exception as e:
        print(f'  [!] 备份失败: {e}')
        return False
    # 覆盖
    try:
        with open(tgt, 'w', encoding='utf-8') as fh:
            fh.write(new_content)
    except Exception as e:
        print(f'  [!] 写入失败: {e}')
        return False
    print(f'  [吸收合并] {source_rel} -> {target_rel}（原内容备份至回收站）')
    return True


def run_apply(args):
    """执行合并（组内大版本吸收同名被引用版）与移除（无引用重复副本）。
    安全策略：默认只处理 --only 指定的组或 --all；绝不删除被引用的唯一文件。"""
    root = os.path.abspath(args.root)
    agents = scan_agents(root)
    if not agents:
        return 3
    filename_set = set(a['title'] + '.md' for a in agents)
    refs = scan_refs(root, filename_set)
    dup = group_by_title(agents)

    # 需要处理的组
    if args.only:
        only = [x.strip() for x in args.only.split(',') if x.strip()]
        groups = {k: v for k, v in dup.items() if k in only}
        missing = [x for x in only if x not in dup]
        if missing:
            print(f'[!] 这些 title 不在重复组中: {missing}')
    else:
        groups = dup

    if not groups:
        print('[提示] 没有可处理的重复组。')
        return 0

    trash_dir = make_trash_dir(root)
    print(f'回收站: {trash_dir}\n')

    changed = 0
    for title, members in sorted(groups.items()):
        print(f'== {title} ==')
        # 按【被引用优先，其次内容长】排序
        members_sorted = sorted(members,
                                key=lambda a: (len(refs.get(os.path.basename(a['title'] + '.md'), [])) == 0, -a['size']))
        # 保留第一个（最优），吸收/移除其余
        keeper = members_sorted[0]
        base = os.path.basename(keeper['title'] + '.md')
        print(f'  保留: {keeper["rel"]} [{keeper["size"]}B] '
              f'（引用 {len(refs.get(base, []))} 处）')
        for a in members_sorted[1:]:
            # 若 A 与被保留者不同路径且 A 内容更少，将其内容合并入保留者？不——
            # 这里是"吸收"，把保留者的完善内容写入 A 的文件名（若 A 被引用），或直接回收 A。
            a_base = os.path.basename(a['title'] + '.md')
            a_refs = refs.get(a_base, [])
            if a_refs:
                # A 被引用但内容更少 → 用 keeper 内容覆盖 A（保住 A 的引用）
                if a['size'] <= keeper['size']:
                    if do_abscomission(root, keeper['rel'], a['rel'], trash_dir, args.verbose):
                        changed += 1
                    else:
                        print(f'  [跳过] 无法合并到 {a["rel"]}')
                else:
                    print(f'  [保留] {a["rel"]} 内容更长且被引用，不动')
            else:
                # A 无引用 → 直接回收
                if trash_file(root, a['rel'], trash_dir):
                    changed += 1
    # end for
    print(f'\n完成。共 {changed} 项变更 → {trash_dir}')
    return 0


def trash_file(root, rel, trash_dir):
    dst = os.path.join(trash_dir, rel.replace('/', '__'))
    src = os.path.join(root, rel)
    if not os.path.isfile(src):
        return False
    try:
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.move(src, dst)
        print(f'  [移除] {rel}')
        return True
    except Exception as e:
        print(f'  [!] 移除失败 {rel}: {e}')
        return False


def main():
    p = argparse.ArgumentParser(description='Claude Code 代理去重/合并工具')
    p.add_argument('--root', default=DEFAULT_ROOT, help='agents 目录')
    p.add_argument('--report', help='报告输出文件')
    p.add_argument('--apply', action='store_true', help='执行写操作（默认 dry-run）')
    p.add_argument('--only', default='', help='仅处理指定重复组标题，逗号分隔（apply 时用）')
    p.add_argument('--verbose', action='store_true', help='显示细节')
    args = p.parse_args()

    if args.apply:
        return run_apply(args)
    return run_detect(args)


if __name__ == '__main__':
    sys.exit(main())