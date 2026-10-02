import type { LocalJSXCommandOnDone } from '../../types/command.js';
export async function call(onDone: LocalJSXCommandOnDone): Promise<undefined> {
  onDone('/output-style 已弃用。请使用 /config 更改输出风格，或在设置文件中配置。更改将在下一会话生效。', {
    display: 'system'
  });
}
