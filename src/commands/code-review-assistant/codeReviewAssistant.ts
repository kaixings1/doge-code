import type { LocalJSXCommandCall } from '../../types/command.js';

export const call: LocalJSXCommandCall = async (onDone, context, args) => {
  const parts = args?.trim().split(/\s+/) || [];
  const command = parts[0]?.toLowerCase() || 'help';

  if (command === 'help' || command === '') {
    return {
      type: 'jsx',
      render: () => [
        '🔍 代码审查助手',
        '',
        '简单的代码审查工具，检测常见问题。',
        '',
        '命令:',
        ' /code-review-assistant check <文件路径> - 检查文件',
        ' /code-review-assistant security <文件路径> - 安全检查',
        ' /code-review-assistant patterns - 查看检测模式',
        ' /code-review-assistant help - 显示帮助',
        '',
        '示例:',
        ' /code-review-assistant check src/utils/helper.ts',
        ' /code-review-assistant security src/api/auth.ts',
        '',
        '检测范围:',
        ' - 安全漏洞（eval、硬编码密码等）',
        ' - 代码异味（TODO、console.log等）',
        ' - 最佳实践（const、async/await等）',
      ].join('\n'),
    };
  }

  return {
    type: 'jsx',
    render: () => `功能开发中。当前命令: ${command}`,
  };
};
