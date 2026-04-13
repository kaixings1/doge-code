import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const srcDir = 'D:\\doge-code\\src';
const results = [];

function getAllTsFiles(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && !entry.name.startsWith('.')) {
        files.push(...getAllTsFiles(fullPath));
      }
    } else if (entry.name.endsWith('.ts')) {
      const stat = statSync(fullPath);
      if (stat.size > 4096) {
        files.push({ path: fullPath, size: stat.size });
      }
    }
  }
  return files;
}

const tsFiles = getAllTsFiles(srcDir);
console.log(`Scanning ${tsFiles.length} .ts files > 4KB...\n`);

// Match user-facing English strings (in quotes, with 3+ words)
const patterns = [
  /['"][A-Z][a-z]+ (?:[a-z]+ ){2,}[^'"]*['"]/g,
  /['"][A-Z][a-z]+ [a-z]+ [a-z]+[^'"]*['"]/g,
];

// Skip patterns that are not user-facing
const skipPatterns = [
  'import ', 'export ', 'function ', 'const ', 'let ', 'type ', 'interface ', 
  'return ', 'if (', 'switch (', 'case ', 'class ', 'enum ', 'Symbol.for',
  'useCallback', 'useState', 'useMemo', 'useEffect', 'useRef', 'useContext',
  'logForDebugging', 'logForDiagnostics', 'logMCPDebug', 'logEvent(',
  'logError(', 'logPluginFetch', 'console.log', 'console.error', 'console.warn',
  'throw new Error', 'new Error(', 'Error:', 'error:', 'warn:', 'debug:',
  'info:', 'level:', 'name:', 'message:', 'type:', 'status:', 'code:',
  'method:', 'url:', 'path:', 'host:', 'port:', 'token:', 'key:',
  'apiKey:', 'secret:', 'password:', 'username:', 'email:',
  'description:', 'title:', 'subtitle:', 'label:', 'value:',
  'placeholder:', 'action:', 'context:', 'fallback:',
];

let checked = 0;
for (const file of tsFiles) {
  try {
    const content = readFileSync(file.path, 'utf8');
    const relPath = file.path.replace(srcDir + '\\', '');
    
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        let text = match[0].replace(/^['"]/, '').replace(/['"]$/, '');
        
        // Skip if too short
        if (text.length < 25) continue;
        // Skip if contains code patterns
        if (skipPatterns.some(skip => text.toLowerCase().includes(skip.toLowerCase()))) continue;
        // Skip if it contains Chinese (already translated)
        if (/[\u4e00-\u9fff]/.test(text)) continue;
        // Skip if it's a URL or email
        if (/https?:\/\//.test(text) || /@/.test(text) || /\/v1\//.test(text)) continue;
        // Skip log/debug/error messages (common patterns)
        if (/^(Initializing|Fetching|Loading|Starting|Connecting|Creating|Updating|Deleting|Processing|Saving|Reading|Writing|Sending|Receiving|Checking|Validating|Verifying|Authenticating|Registering|Unregistering|Subscribing|Unsubscribing|Enabling|Disabling|Activating|Deactivating|Pausing|Resuming|Stopping|Restarting|Reloading|Refreshing|Clearing|Resetting|Restoring|Backing up|Archiving|Compressing|Extracting|Installing|Uninstalling|Upgrading|Downgrading|Migrating|Converting|Transforming|Parsing|Serializing|Deserializing|Encoding|Decoding|Encrypting|Decrypting|Hashing|Signing|Verifying)/i.test(text)) continue;
        
        results.push({ file: relPath, text: text.trim().substring(0, 120) });
      }
      pattern.lastIndex = 0;
    }
    
    checked++;
    if (checked % 100 === 0) console.log(`Checked ${checked}/${tsFiles.length}`);
  } catch {}
}

console.log(`\n\nFound ${results.length} potential English UI strings:\n`);
const uniqueFiles = [...new Set(results.map(r => r.file))];
console.log(`Affected files: ${uniqueFiles.length}\n`);

for (const r of results.slice(0, 80)) {
  console.log(`${r.file}`);
  console.log(`  "${r.text}"`);
  console.log();
}
