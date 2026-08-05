const ts = require('typescript');
const fs = require('fs');

const files = [
  'src/commands/loop/types.ts',
  'src/commands/loop/base.ts',
  'src/commands/loop/engine.ts',
  'src/commands/loop/strategies/autogpt.ts',
  'src/commands/loop/shortcuts.ts',
  'src/commands/loop/index.tsx',
  'src/commands/loop/ai-task-executor.ts',
];

let hasErrors = false;
for (const file of files) {
  try {
    const code = fs.readFileSync(file, 'utf-8');
    const result = ts.transpileModule(code, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        jsx: ts.JsxEmit.React,
        allowJs: true,
        esModuleInterop: true,
        resolveJsonModule: true,
        moduleResolution: ts.ModuleResolutionKind.NodeJs,
      },
      reportDiagnostics: true,
    });
    if (result.diagnostics && result.diagnostics.length > 0) {
      const errors = result.diagnostics.filter(d => d.category === ts.DiagnosticCategory.Error);
      if (errors.length > 0) {
        console.log('ERRORS in ' + file + ':');
        for (const d of errors) {
          console.log('  Line ' + (d.start || 0) + ': ' + ts.flattenDiagnosticMessageText(d.messageText, '\n'));
        }
        hasErrors = true;
      } else {
        console.log('OK: ' + file + ' (warnings only)');
      }
    } else {
      console.log('OK: ' + file);
    }
  } catch (e) {
    console.log('EXCEPTION in ' + file + ': ' + e.message);
    hasErrors = true;
  }
}
if (!hasErrors) console.log('\n=== All loop engine files compile successfully! ===');
