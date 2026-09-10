import json
r = json.load(open('D:/doge-code/.claude/hooks/skill-rules.json', encoding='utf-8'))
active = [s for s in r['skills'] if s['enabled']]
for s in active[:5]:
    print(f"{s['name']} | kw={s['keywords']}")
print(f'... total active: {len(active)}')
disabled = [s for s in r['skills'] if not s['enabled']]
print(f'Disabled sample: {disabled[0]["name"]} | kw={disabled[0]["keywords"]}')
print(f'... total disabled: {len(disabled)}')
