import sys
p = 'i18n_issue_list.md'
target = sys.argv[1]
s = open(p, encoding='utf-8').read()
old = '- [ ] ' + target
new = '- [x] ' + target
if old in s:
    s = s.replace(old, new)
    open(p, 'w', encoding='utf-8').write(s)
    print('MARKED ' + target)
else:
    print('NOTFOUND ' + target)
