import json, urllib.request, sys

url = "https://api.github.com/repos/cat-xierluo/legal-skills/contents/skills/workbuddy-checkin/scripts"
with urllib.request.urlopen(url) as resp:
    data = json.loads(resp.read())

for item in data:
    name = item['name']
    itype = item['type']
    size = item.get('size', 0)
    print(f"{name:30s}  {itype:4s}  {size:>8d} bytes")
