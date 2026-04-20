/**
 * 修复被错误翻译的源代码
 * 恢复文件路径、变量名、导入等不应该翻译的内容
 */

import { readFileSync, writeFileSync } from 'fs';

// 需要恢复的文件路径
const filesToFix = [
  'src/memdir/memdir.ts',
  'src/cli/print.ts',
  'src/bridge/bridgeMessaging.ts',
  'src/bridge/envLessBridgeConfig.ts',
  'src/bridge/replBridge.ts',
  'src/bridge/sessionRunner.ts',
  'src/bridge/workSecret.ts',
  'src/buddy/prompt.ts',
  'src/cli/transports/WebSocketTransport.ts',
  'src/commands/insights.ts',
  'src/commands/thinkback/thinkback.tsx',
  'src/components/ApproveApiKey.tsx',
  'src/components/AutoUpdater.tsx',
  'src/components/BridgeDialog.tsx',
  'src/components/BypassPermissionsModeDialog.tsx',
  'src/components/ClaudeMdExternalIncludesDialog.tsx',
  'src/components/DesktopHandoff.tsx',
  'src/components/DevBar.tsx',
  'src/components/DevChannelsDialog.tsx',
  'src/components/ExportDialog.tsx',
  'src/components/FallbackToolUseErrorMessage.tsx',
  'src/components/ManagedSettingsSecurityDialog/ManagedSettingsSecurityDialog.tsx',
  'src/components/Onboarding.tsx',
  'src/components/TrustDialog/TrustDialog.tsx',
  'src/ink/ink.tsx',
  'src/keybindings/schema.ts',
  'src/server/directConnectManager.ts',
  'src/services/api/claude.ts',
  'src/utils/autoUpdater.ts',
  'src/utils/cronTasks.ts',
];

// 需要恢复的中文文件路径
const chinesePaths = [
  '会话Storage',
  '会话Storage.js',
  '设置s',
  '设置s.js',
  '消息',
  '消息.js',
  '消息QueueManager',
  '消息QueueManager.js',
];

// 需要恢复的中文变量名和类型
const chineseIdentifiers = [
  '会话',
  '设置s',
  '设置',
  '消息',
  '警告',
  '错误',
  '检查',
  '提示',
];

// 需要恢复的注释翻译
const chineseToEnglish = [
  ['警告', 'warning'],
  ['错误', 'error'],
  ['检查', 'checking'],
  ['提示', 'prompt'],
  ['会话', 'session'],
  ['设置', 'settings'],
];

// 执行修复
async function fixFile(filePath: string) {
  try {
    const content = readFileSync(filePath, 'utf-8');
    let fixed = content;

    // 1. 恢复文件路径
    for (const path of chinesePaths) {
      // 匹配文件路径中的中文字符并替换为英文
      const regex = new RegExp(path.replace(/[^\w]/g, '\\$&'), 'g');
      fixed = fixed.replace(regex, path.replace(/[\u4e00-\u9fa5]/g, ''));
    }

    // 2. 恢复变量名和类型名（只恢复单词边界的情况）
    for (const id of chineseIdentifiers) {
      const regex = new RegExp(`\\b${id.replace(/[^\w]/g, '\\$&')}\\b`, 'g');
      fixed = fixed.replace(regex, id.replace(/[\u4e00-\u9fa5]/g, ''));
    }

    // 3. 恢复注释翻译
    for (const [chinese, english] of chineseToEnglish) {
      fixed = fixed.replace(new RegExp(chinese, 'g'), english);
    }

    // 写回文件
    if (fixed !== content) {
      writeFileSync(filePath, fixed);
      console.log(`✓ 已修复: ${filePath}`);
    } else {
      console.log(`- 跳过: ${filePath} (无需修复)`);
    }
  } catch (error) {
    console.error(`✗ 失败: ${filePath}`, error);
  }
}

// 执行批量修复
async function main() {
  console.log('开始修复错误翻译...\n');

  for (const file of filesToFix) {
    await fixFile(file);
  }

  console.log('\n修复完成！');
}

main();