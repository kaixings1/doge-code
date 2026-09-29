import re

# Fix useVoiceIntegration.tsx - cast audioChunks to string[]
with open('D:/doge-code/src/hooks/useVoiceIntegration.tsx', 'r', encoding='utf-8') as f:
    c = f.read()

# Replace unknown length accesses with typed casts
c = c.replace(
    "if (audioChunks.length === 0)",
    "if ((audioChunks as string[]).length === 0)"
)
c = c.replace(
    "const transcript = await transcribeAudio(audioChunks);",
    "const transcript = await transcribeAudio(audioChunks as string[]);"
)

with open('D:/doge-code/src/hooks/useVoiceIntegration.tsx', 'w', encoding='utf-8') as f:
    f.write(c)
print('useVoiceIntegration.tsx done')

# Fix GraphqlTool.ts
with open('D:/doge-code/src/tools/GraphqlTool/GraphqlTool.ts', 'r', encoding='utf-8') as f:
    c = f.read()

c = c.replace(
    "if (query.length < 3)",
    "if (typeof query === 'string' && query.length < 3)"
)

with open('D:/doge-code/src/tools/GraphqlTool/GraphqlTool.ts', 'w', encoding='utf-8') as f:
    f.write(c)
print('GraphqlTool.ts done')

# Fix notebook.ts
with open('D:/doge-code/src/utils/notebook.ts', 'r', encoding='utf-8') as f:
    c = f.read()

c = c.replace(
    "if (outputs.length === 0)",
    "if ((outputs as any[]).length === 0)"
)

with open('D:/doge-code/src/utils/notebook.ts', 'w', encoding='utf-8') as f:
    f.write(c)
print('notebook.ts done')

# Fix plans.ts
with open('D:/doge-code/src/utils/plans.ts', 'r', encoding='utf-8') as f:
    c = f.read()

c = c.replace(
    "if (steps.length === 0)",
    "if ((steps as any[]).length === 0)"
)

with open('D:/doge-code/src/utils/plans.ts', 'w', encoding='utf-8') as f:
    f.write(c)
print('plans.ts done')
