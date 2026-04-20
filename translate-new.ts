/**
 * 批量汉化源代码中的英文用户提示信息 - 扩展版
 * 执行方式: bun run translate-new.ts
 */

import { readFileSync, writeFileSync } from 'fs';
import { glob } from 'glob';

// 扩展的文件列表
const filesToTranslate = [
  // 组件文件
  'components/BypassPermissionsModeDialog.tsx',
  'components/DevChannelsDialog.tsx',
  'components/ClaudeMdExternalIncludesDialog.tsx',
  'components/AutoUpdater.tsx',
  'components/Onboarding.tsx',
  'components/TrustDialog/TrustDialog.tsx',
  'components/ExportDialog.tsx',
  'components/ManagedSettingsSecurityDialog/ManagedSettingsSecurityDialog.tsx',
  'components/CostThresholdDialog.tsx',
  'components/IdleReturnDialog.tsx',
  
  // 工具文件
  'utils/autoUpdater.ts',
];

// 扩展的翻译映射表
const translations: Record<string, string> = {
  // BypassPermissionsModeDialog.tsx
  'In Bypass Permissions mode': '在绕过权限模式下',
  'Claude Code will not ask for your approval before running': 'Claude Code 不会在运行前征求您的批准',
  'potentially dangerous commands': '潜在危险命令',
  'This mode should only be used in': '此模式只能用于',
  'a sandboxed container/VM': '沙盒容器/VM',
  'that has restricted internet access': '具有受限网络访问权限',
  'and can easily be restored if damaged': '且易于恢复',
  'By proceeding, you accept all responsibility for actions taken': '通过继续操作，您接受采取的所有行动的全部责任',
  'while running in Bypass Permissions mode': '在绕过权限模式下运行时',
  'warning': '警告',
  'Claude Code 正在跳过权限模式下运行': 'Claude Code 正在跳过权限模式下运行',
  
  // DevChannelsDialog.tsx
  '--dangerously-load-development-channels': '--dangerously-load-development-channels',
  'is for local channel development only': '仅用于本地频道开发',
  'Do not use this option to run': '不要使用此选项来运行',
  'channels you have downloaded off the internet': '您从互联网下载的频道',
  '警告：正在加载开发频道': '警告：正在加载开发频道',
  
  // ClaudeMdExternalIncludesDialog.tsx
  'This project\'s CLAUDE.md imports files outside': '此项目的 CLAUDE.md 导入当前工作目录之外的文件',
  'the current working directory': '当前工作目录',
  'Never allow this for third-party repositories': '永远不要为第三方仓库允许此操作',
  '警告：允许外部 CLAUDE.md 文件导入？': '警告：是否允许外部 CLAUDE.md 文件导入？',
  
  // AutoUpdater.tsx
  '✗ Auto-update failed': '✗ 自动更新失败',
  'Try <Text bold>claude doctor</Text> or...': '请尝试 <Text bold>claude doctor</Text> 或...',
  '无法自动更新开发版本': '无法自动更新开发版本',
  'Auto-updating…': '正在自动更新…',
  '✓ Update installed · Restart to apply': '✓ 更新已安装 · 重启以应用',
  
  // Onboarding.tsx
  'Claude 可能会犯错': 'Claude 可能会犯错',
  'You should always review Claude\'s responses': '您应该始终审查 Claude 的响应',
  'especially when running code': '特别是在运行代码时',
  'Due to prompt injection risks': '由于提示注入风险',
  'only use it with code you trust': '仅在与您信任的代码一起使用时使用',
  'For more details see:': '有关更多详细信息，请参阅：',
  'For the optimal coding experience': '为了获得最佳编码体验',
  'enable the recommended settings for your terminal': '为您的终端启用推荐设置',
  
  // TrustDialog.tsx
  'Quick safety check: Is this a project you created or one you trust?': '快速安全检查：这是您创建的还是您信任的项目吗？',
  'Like your own code, a well-known open source project, or work from your team': '像您自己的代码、知名的开放源代码项目，或您团队的工作',
  'If not, take a moment to review what\'s in this folder first': '如果不是，请花一点时间先查看此文件夹中的内容',
  'Claude Code\'ll be able to read, edit, and execute files here': 'Claude Code 将能够在此读取、编辑和执行文件',
  'Security guide': '安全指南',
  
  // AutoUpdater.ts
  'It looks like your version of Claude Code needs an update': '您的 Claude Code 版本需要更新',
  'A newer version is required to continue': '继续需要更新版本',
  'Error: Windows NPM detected in WSL': '错误：在 WSL 环境中检测到 Windows NPM',
  
  // ExportDialog.tsx
  '复制到剪贴板': '复制到剪贴板',
  '保存到文件': '保存到文件',
  '将对话复制到系统剪贴板': '将对话复制到系统剪贴板',
  '将对话保存到当前目录的文件': '将对话保存到当前目录的文件',
  '导出对话': '导出对话',
  '选择导出方式：': '选择导出方式：',
  '输入文件名：': '输入文件名：',
  
  // ManagedSettingsSecurityDialog.tsx
  'Cloud Authentication': '云端认证',
  '管理设置需要审批': '管理设置需要审批',
  
  // CostThresholdDialog.tsx
  '了解更多关于如何监控支出的信息：': '了解更多关于如何监控支出的信息：',
  '本次会话已在 Anthropic API 上花费 $5': '本次会话已在 Anthropic API 上花费 $5',
  
  // IdleReturnDialog.tsx
  '您已离开 [时间]，此对话已使用 [tokens]': '您已离开 [时间]，此对话已使用 [tokens]',
  '如果是新任务，清除上下文将节省用量并更快执行': '如果是新任务，清除上下文将节省用量并更快执行',
  '继续此对话': '继续此对话',
  '作为新对话发送消息': '作为新对话发送消息',
  '不再询问': '不再询问',
  
  // BridgeDialog.tsx
  'd to disconnect · space for QR code · Enter/Esc to close': 'd 断开连接 · 空格显示二维码 · Enter/Esc 关闭',
  'Environment:': '环境',
  'Session:': '会话',
  
  // 通用翻译
  'Cloud': '云端',
  'DOGE_API_KEY': 'DOGE_API_KEY',
  '自动模式': '自动模式',
  'allow Claude to automatically handle permission prompts': '允许 Claude 自动处理权限提示',
  'Claude will check each tool call for risky operations and prompt injection before executing': 'Claude 会在执行前检查每个工具调用是否存在风险操作和提示注入',
  'operations judged safe by Claude will be executed': 'Claude 判定为安全的操作会被执行',
  'operations judged risky will be blocked': 'Claude 判定为风险的会被阻止',
  'Claude may try different approaches': 'Claude 可能会尝试不同的方法',
  'suitable for long-running tasks': '适合长时间运行的任务',
  'session cost slightly higher': '会话成本略高',
  'Claude may make mistakes leading to harmful commands running': 'Claude 可能会犯错导致有害命令运行',
  'recommended to use only in isolated environments': '建议仅在隔离环境中使用',
  'Press Shift+Tab to toggle mode': '按 Shift+Tab 切换模式',
};

// 执行翻译
async function translateFile(filePath: string) {
  try {
    const fullPath = `src/${filePath}`;
    const content = readFileSync(fullPath, 'utf-8');
    let translated = content;

    // 应用所有翻译
    for (const [english, chinese] of Object.entries(translations)) {
      translated = translated.replace(new RegExp(english, 'g'), chinese);
    }

    // 写回文件
    if (translated !== content) {
      writeFileSync(fullPath, translated);
      console.log(`✓ 已翻译: ${filePath}`);
    } else {
      console.log(`- 跳过: ${filePath} (无需翻译)`);
    }
  } catch (error) {
    console.error(`✗ 失败: ${filePath}`, error);
  }
}

// 执行批量翻译
async function main() {
  console.log('开始汉化（扩展版）...\n');

  for (const file of filesToTranslate) {
    await translateFile(file);
  }

  console.log('\n汉化完成！');
}

main();