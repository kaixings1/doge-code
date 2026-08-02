const { readFileSync } = require('fs');

// Read the actual source from the built renderer output
const source = readFileSync('dist/renderer/components/TestRunnerPanel.js', 'utf-8');

// Check if it contains require('fs') and require('path')
const hasFs = source.includes("require('fs')");
const hasPath = source.includes("require('path')");

console.log('\n=== Checking bundled renderer for Node builtins ===\n');
console.log('  Contains require("fs"): ' + hasFs);
console.log('  Contains require("path"): ' + hasPath);

if (hasFs || hasPath) {
  console.log('\n  WARNING: Renderer bundle contains Node.js builtin requires!');
  console.log('  With nodeIntegration:false, these will fail at runtime.\n');
} else {
  console.log('\n  OK: No Node.js builtin requires found in renderer bundle.\n');
}

// Also check the App.js bundle for the handleRollback return type fix
const appSource = readFileSync('dist/renderer/App.js', 'utf-8');
const hasReturn = appSource.includes('return res');
console.log('  handleRollback returns result: ' + hasReturn);

// Check for theme changes
const themeSource = readFileSync('dist/renderer/theme.js', 'utf-8');
const hasSuccessText = themeSource.includes('successText');
const hasWarningText = themeSource.includes('warningText');
console.log('  theme.js has successText: ' + hasSuccessText);
console.log('  theme.js has warningText: ' + hasWarningText);

console.log('\n=== Bundle check complete ===\n');
