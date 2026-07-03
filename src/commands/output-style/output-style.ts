import type { LocalJSXCommandOnDone } from '../../types/command.js';
export async function call(onDone: LocalJSXCommandOnDone): Promise<undefined> {
  onDone('/output-style 已被弃用，请使用 /config 更改您的输出样式，或在设置文件中设置。更改将在下次会话中生效。', {
    display: 'system'
  });
}
