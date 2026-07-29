// Quick test to verify the abortController fix in toolExecutionContext
import { createAdaptedTools } from './desktop/src/main/toolExecutor.js';
import { loadConfig } from './desktop/src/main/index.js';

const config = loadConfig();
console.log('[TEST] Config loaded:', config.model, config.provider);

const tools = createAdaptedTools(config);
console.log('[TEST] Tools created:', tools.size);

for (const [name, tool] of tools) {
  console.log('[TEST] Tool:', name);
  // Verify execute function doesn't crash on missing abortController
  const testArgs = name === 'BashTool' ? { command: 'echo hello', description: 'test' } : {};
  try {
    const result = await tool.execute(testArgs);
    console.log('[TEST] Result for', name, ':', typeof result.content === 'string' ? result.content.slice(0, 60) : 'non-string result');
  } catch (e) {
    console.log('[TEST] Error for', name, ':', e instanceof Error ? e.message : String(e));
  }
  break; // Just test first tool
}

console.log('[TEST] Done - if no crash above, abortController fix works!');
