#!/usr/bin/env python3
"""Generate skill-rules.json from all SKILL.md frontmatter."""
import os, re, json

SKILLS_DIR = 'D:/doge-code/.claude/skills'
OUTPUT = 'D:/doge-code/.claude/hooks/skill-rules.json'

STOP_WORDS = set('''
a an the is are was were be been being have has had do does did will would could should
for to of in on at by from with into during before after above below between out off over
under again further then once here there when where why how all both each few more most other
some such no nor not only own same so than too very just because but and or if while about
through during before after above below between out off over under again further then once
'''.split())

def extract_frontmatter(path):
    try:
        with open(path, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read(3000)
    except:
        return None, None
    if not content.startswith('---'):
        return None, None
    end = content.find('---', 3)
    if end == -1:
        return None, None
    fm = content[3:end]
    name = None
    desc = None
    m = re.search(r'^name:\s*(.+)', fm, re.MULTILINE)
    if m:
        name = m.group(1).strip().strip('"').strip("'")
    m = re.search(r'^description:\s*(.+)', fm, re.MULTILINE)
    if m:
        desc = m.group(1).strip().strip('"').strip("'")
        if len(desc) > 120:
            desc = desc[:117] + '...'
    return name, desc

skills = []
for root, dirs, files in os.walk(SKILLS_DIR):
    dirs[:] = [d for d in dirs if not d.startswith('.') and d != '_archived']
    if 'SKILL.md' in files:
        path = os.path.join(root, 'SKILL.md')
        rel = os.path.relpath(path, SKILLS_DIR)
        name, desc = extract_frontmatter(path)
        if not name:
            name = rel.replace('/SKILL.md', '').replace('\\', '/')
        if not desc:
            desc = ''
        skill = {
            'name': name,
            'description': desc[:120],
            'keywords': [w.lower() for w in name.replace('-', ' ').replace(':', ' ').split() if len(w) > 3 and w.lower() not in STOP_WORDS][:8],
            'intentPatterns': [],
            'enabled': True,
            'source': rel.replace('\\', '/'),
        }
        skills.append(skill)

# Mark mega-dir skills as disabled (loaded on demand only)
for s in skills:
    top = s['source'].split('/')[0]
    if top in ('cybersecurity-skills', 'ecc') or top.startswith('repo-'):
        s['enabled'] = False

rules = {
    'version': '1.0.0',
    'description': 'Auto-generated skill activation rules. Mega-dir skills disabled by default.',
    'activationThreshold': 3,
    'skills': skills
}

with open(OUTPUT, 'w', encoding='utf-8') as f:
    json.dump(rules, f, ensure_ascii=False, indent=2)

active = sum(1 for s in skills if s['enabled'])
disabled = sum(1 for s in skills if not s['enabled'])
print(f'Total: {len(skills)}, Active: {active}, Disabled: {disabled}')
print(f'Written to {OUTPUT}')
