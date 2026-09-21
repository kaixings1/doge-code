#!/usr/bin/env node
/**
 * HeartFlow Repo Audit — local audit report generator
 *
 * Usage:
 *   node repo-audit.js /path/to/repo [repo_name] [output.md]
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(process.argv[2] || '.');
const REPO_NAME = process.argv[3] || path.basename(ROOT);
const OUTPUT = process.argv[4] || path.join(ROOT, 'heartflow-audit-report.md');

function rel(p) { return path.relative(ROOT, p); }
function exists(p) { return fs.existsSync(p); }
function read(p) { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } }
function walk(dir) {
  let out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (['.git','node_modules','__pycache__','.venv','venv','dist','build'].includes(entry.name)) continue;
    if (entry.isDirectory()) out = out.concat(walk(full));
    else out.push(full);
  }
  return out;
}
function countLines(text) { return text.split(/\r?\n/).length; }
function hasString(files, re) {
  const hits = [];
  for (const f of files) {
    const text = read(f);
    if (re.test(text)) hits.push(rel(f));
  }
  return hits;
}

const allFiles = walk(ROOT);
const pyFiles = allFiles.filter(f => f.endsWith('.py'));
const jsFiles = allFiles.filter(f => /\.(js|ts|jsx|tsx)$/.test(f));
const mdFiles = allFiles.filter(f => f.endsWith('.md'));
const yamlFiles = allFiles.filter(f => /\.(ya?ml|json)$/.test(f) && !f.endsWith('package-lock.json'));
const totalLines = allFiles.reduce((n, f) => n + countLines(read(f)), 0);

const secretLikeRaw = hasString(allFiles, /(AIza|sk-(live|test|prod)_[A-Za-z0-9]{20,}|-----BEGIN (RSA |EC )?PRIVATE KEY-----|github_pat_[A-Za-z0-9_]{20,}|ghp_[A-Za-z0-9]{36}|xox[baprs]-[A-Za-z0-9-]{10,})/i);
const secretLike = secretLikeRaw.filter(f => !/\.(svg|png|jpg|jpeg|gif|ico|webp)$/i.test(f));

const shellInjection = hasString(allFiles, /(exec\(|eval\(|os\.system\(|subprocess\.(call|run|Popen)\(.*shell\s*=\s*True|child_process\.exec)/);
const pathTraversal = hasString(allFiles, /(open\(.*\+|Path\(.*\+|path\.join\(.*\.\.[/\\])/);
const promptInjection = hasString(allFiles, /(ignore previous|disregard above|forget instructions|you are now|act as if|system prompt|jailbreak)/i);

const licenseFile = ['LICENSE','LICENSE.md','LICENSE.txt','COPYING'].find(f => exists(path.join(ROOT,f)));
const hasSecurityPolicy = exists(path.join(ROOT, 'SECURITY.md'));
const hasCodeOfConduct = exists(path.join(ROOT, 'CODE_OF_CONDUCT.md'));
const hasContributing = exists(path.join(ROOT, 'CONTRIBUTING.md'));
const hasCi = fs.existsSync(path.join(ROOT, '.github', 'workflows'));

const now = new Date().toISOString().slice(0,19).replace('T',' ');
const risk = secretLike.length ? 'Medium' : (shellInjection.length || pathTraversal.length) ? 'Low-Medium' : 'Low';
const report = `# HeartFlow Repository Audit — ${REPO_NAME}

**Date:** ${now}
**Auditor:** HeartFlow v6.7.13 (rule-based discriminator, zero external LLM)
**Target:** ${ROOT}
**Classification:** Confidential — for repository maintainers only

---

## 1. Executive Summary

| Metric | Value |
|--------|-------|
| Total files | ${allFiles.length.toLocaleString()} |
| Total source lines | ${totalLines.toLocaleString()} |
| Python files | ${pyFiles.length.toLocaleString()} |
| JS/TS files | ${jsFiles.length.toLocaleString()} |
| Markdown files | ${mdFiles.length.toLocaleString()} |
| Config files | ${yamlFiles.length.toLocaleString()} |
| Secret-like strings | ${secretLike.length} |
| Shell-invocation sites | ${shellInjection.length} |
| Path-traversal patterns | ${pathTraversal.length} |
| Prompt-injection doc strings | ${promptInjection.length} |
| CI present | ${hasCi ? 'yes' : 'no'} |
| Security policy | ${hasSecurityPolicy ? 'yes' : 'no'} |
| License file | ${licenseFile || 'none'} |

**Overall risk:** ${risk}

---

## 2. Scope

Static analysis of the repository at ${ROOT}.
Covered: Python, JS/TS, Markdown, YAML/JSON.
Excluded: binary assets, vendored dependencies, build outputs.

---

## 3. Findings

### 3.1 Secrets / Credentials
${secretLike.length === 0 ? 'No secret-like strings detected.' : `Detected ${secretLike.length} secret-like strings:\n` + secretLike.map((f,i) => `${i+1}. \`${f}\``).join('\n')}

### 3.2 Command Execution
${shellInjection.length === 0 ? 'No shell-invocation patterns detected.' : `Detected ${shellInjection.length} sites:\n` + shellInjection.slice(0,20).map((f,i) => `${i+1}. \`${f}\``).join('\n') + (shellInjection.length>20 ? '\n... (truncated)' : '')}

### 3.3 Path Traversal
${pathTraversal.length === 0 ? 'No path-traversal patterns detected.' : `Detected ${pathTraversal.length} sites:\n` + pathTraversal.slice(0,20).map((f,i) => `${i+1}. \`${f}\``).join('\n') + (pathTraversal.length>20 ? '\n... (truncated)' : '')}

### 3.4 Prompt Injection in Docs / Strings
${promptInjection.length === 0 ? 'No prompt-injection-like strings detected in source/docs.' : `Detected ${promptInjection.length} strings:\n` + promptInjection.slice(0,20).map((f,i) => `${i+1}. \`${f}\``).join('\n') + (promptInjection.length>20 ? '\n... (truncated)' : '')}

### 3.5 Governance
- License: ${licenseFile ? 'present' : 'missing'}
- Security policy: ${hasSecurityPolicy ? 'present' : 'missing'}
- Code of conduct: ${hasCodeOfConduct ? 'present' : 'missing'}
- Contributing guide: ${hasContributing ? 'present' : 'missing'}
- CI/CD: ${hasCi ? 'present' : 'missing'}

---

## 4. Recommendations

1. Review all secret-like strings; rotate any real credentials.
2. Audit shell-invocation sites for untrusted input.
3. Validate all file paths through an allowlist before I/O.
4. Add a SECURITY.md if missing.
5. Consider a follow-up audit with conversation logs / prompt templates for live behavior testing.

---

## 5. Limitations

- This audit is static-only. Runtime behavior, multi-turn agent conversations, and tool-abuse patterns require a live execution trace.
- String-based detection can produce false positives on test fixtures and documentation examples.

---

*Generated by HeartFlow v6.7.13. No external LLM was used in the production of this report.*
`;

fs.writeFileSync(OUTPUT, report, 'utf8');
console.log(`REPORT ${OUTPUT}`);
console.log(`FILES ${allFiles.length}`);
console.log(`LINES ${totalLines}`);
console.log(`SECRETS ${secretLike.length}`);
console.log(`SHELL ${shellInjection.length}`);
console.log(`TRAV ${pathTraversal.length}`);
console.log(`PROMPT ${promptInjection.length}`);
