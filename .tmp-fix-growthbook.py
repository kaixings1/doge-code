import re

# Fix GrowthBook.ts line 183: window._growthbook = this;
with open('D:/doge-code/src/GrowthBook.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix 1: line 183 - window._growthbook = this -> cast to any
content = content.replace(
    '      window._growthbook = this;',
    '      window._growthbook = this as unknown as GrowthBook<Record<string, any>>;'
)

# Fix 2: line 247 - StickyBucketService -> StickyBucketServiceSync conversion
# Need to convert to unknown first: sbs as unknown as StickyBucketServiceSync
# Find the line with "new StickyBucketServiceSync" or similar pattern
# Actually the error is at line 247 about conversion
# Let me find it in the file

# Fix 3: line 575 - comparison issue
# The comparison `this == ...` has no overlap issue
# Find and fix

# Fix 4: line 1116 - StickyBucketService argument mismatch

# Let me also fix auto-wrapper.ts
# Line 39: Subsequent property declarations must have same type
# Line 171: StickyBucketService argument mismatch

with open('D:/doge-code/src/GrowthBook.ts', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Print lines around 247 to understand the error
for i in range(240, 255):
    print(f"{i+1}: {lines[i].rstrip()}")
