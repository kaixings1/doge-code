# JS Regex Debugging Notes (2026-09-11)

## Infinite loop: `while ((m = re.exec(text)) !== null)` with non-global regex

**Symptom**: node process hangs, never returns, CPU at 100%.

**Root cause**: A non-global regex keeps returning the same match at position 0 forever.

```js
const pat = /foo/i;
while ((m = pat.exec(text)) !== null) { // infinite if text contains 'foo'
  ...
}
```

**Fix**: Use `text.match(pat)` once, or add `g` flag and reset `lastIndex` between independent runs.

```js
// Safe: match once
const m = text.match(pat);
if (m) { ... }

// Safe: global with manual reset
pat.lastIndex = 0;
while ((m = pat.exec(text)) !== null) { ... }
```

## `matchAll()` requires a global regex

**Symptom**: `TypeError: String.prototype.matchAll called with a non-global RegExp argument`

```js
const re = /foo/; // missing /g
text.matchAll(re); // throws
```

**Fix**: ensure the `g` flag is present.

```js
const m = [...text.matchAll(new RegExp(re.source, re.flags + 'g'))];
```

## Recommended pattern: `_collect` helper

When scanning text with multiple patterns (most non-global), use a single `match()` per pattern instead of `exec()` loops:

```js
function _collect(text, patterns, label) {
  const hits = [];
  for (const pat of patterns) {
    const m = text.match(pat); // safe: returns once, even without /g
    if (m) {
      for (const raw of m) hits.push({ ... });
    }
  }
  return hits;
}
```

This avoids the infinite-loop class of bug entirely and matches the same text once.
