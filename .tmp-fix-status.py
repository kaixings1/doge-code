with open('D:/doge-code/src/components/Settings/Status.tsx', 'r', encoding='utf-8') as f:
    c = f.read()
c = c.replace(
    'const diagnostics = use(promise);',
    'const diagnostics = use(promise) as Diagnostic[];'
)
with open('D:/doge-code/src/components/Settings/Status.tsx', 'w', encoding='utf-8') as f:
    f.write(c)
print('Done')
