const ts = require('typescript');
const fs = require('fs');
const path = require('path');

const files = [
  'src/commands/loop/types.ts',
  'src/commands/loop/engine.ts',
  'src/commands/loop/strategies/autogpt.ts',
  'src/commands/loop/strategies/openhands.ts',
  'src/commands/loop/shortcuts.ts',
  'src/commands/loop/index.tsx',
  'src/commands/loop/ai-task-executor.ts',
];

let hasErrors = false;
for (const file of files) {
  const full = path.resolve(file);
  if (!fs.existsSync(full)) { console.log('SKIP (missing): ' + file); continue; }
  const code = fs.readFileSync(full, 'utf-8');
  const result = ts.transpileModule(code, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.React,
      allowJs: true,
      esModuleInterop: true,
      resolveJsonModule: true,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
      ignoreDeprecations: '6.0',
    },
    reportDiagnostics: true,
    fileName: file,
  });
  const errors = (result.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error);
  if (errors.length > 0) {
    console.log('ERRORS in ' + file + ':');
    for (const d of errors) {
      console.log('  ' + ts.flattenDiagnosticMessageText(d.messageText, '\n'));
    }
    hasErrors = true;
  } else {
    console.log('OK: ' + file);
  }
}
if (!hasErrors) console.log('\n=== 全部编译通过 ===');
