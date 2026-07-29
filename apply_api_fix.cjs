const fs = require('fs');
const path = 'desktop/src/main/apiClient.ts';
let c = fs.readFileSync(path, 'utf-8');

const old = `                      if (choice.finish_reason) {
                        const stopReason = mapFinishReason(choice.finish_reason as string | undefined)
                        if (toolCallAccum.size > 0) {
                          for (const [idx, tc] of toolCallAccum) {
                            yield { type: 'content_block_stop', index: idx }
                          }
                          toolCallAccum.clear()
                        }
                        yield { type: 'message_delta', delta: { stop_reason: stopReason }, usage: chunk.usage }
                      }`;

const newStr = `                      if (choice.finish_reason) {
                        const stopReason = mapFinishReason(choice.finish_reason as string)
                        if (toolCallAccum.size > 0) {
                          for (const [idx, tc] of toolCallAccum) {
                            yield { type: 'content_block_start', index: idx, content_block: { type: 'tool_use', id: tc.id, name: tc.name, input: tc.args } }
                            if (tc.args) {
                              yield { type: 'content_block_delta', index: idx, delta: { type: 'input_json_delta', partial_json: tc.args } }
                            }
                            yield { type: 'content_block_stop', index: idx }
                          }
                          toolCallAccum.clear()
                        }
                        yield { type: 'message_delta', delta: { stop_reason: stopReason }, usage: chunk.usage }
                      }`;

if (c.includes(old)) {
  c = c.replace(old, newStr);
  fs.writeFileSync(path, c);
  console.log('SUCCESS - apiClient.ts fix applied');
} else {
  console.log('OLD STRING NOT FOUND');
  // Show what's actually there
  const idx = c.indexOf("content_block_stop', index: idx }");
  if (idx >= 0) {
    console.log('Found content_block_stop at', idx);
    console.log('Context:', c.substring(Math.max(0, idx - 300), idx + 100));
  }
}