/**
 * 批量汉化源代码中的英文用户提示信息 - 第三阶段
 * 执行方式: bun run translate-third.ts
 */

import { readFileSync, writeFileSync } from 'fs';
import { glob } from 'glob';

// 扩展的文件列表
const filesToTranslate = [
  // 组件文件
  'components/DesktopHandoff.tsx',
  'components/DevBar.tsx',
  'components/ApproveApiKey.tsx',
  'components/CustomSelect/index.tsx',
  'components/BridgeDialog.tsx',
  'components/ExportDialog.tsx',
];

// 扩展的翻译映射表
const translations: Record<string, string> = {
  // DesktopHandoff.tsx
  'checking': '检查中',
  'prompt-download': '提示下载',
  'flushing': '刷新中',
  'opening': '打开中',
  'success': '成功',
  'error': '错误',
  '未知错误': '未知错误',
  '无法打开 Claude Desktop': '无法打开 Claude Desktop',
  '正在 Claude Desktop 中打开…': '正在 Claude Desktop 中打开…',
  'Error: {error}': '错误：{error}',
  '打开 Claude Desktop': '打开 Claude Desktop',
  
  // DevBar.tsx
  '[ANT-ONLY] slow sync:': '[ANT-ONLY] 同步缓慢：',
  'ANT-ONLY': '仅限 ANT 用户',
  
  // ApproveApiKey.tsx
  '检测到自定义 API 密钥': '检测到自定义 API 密钥',
  '自定义 API 密钥': '自定义 API 密钥',
  'Do not proceed if you did not install this.': '如果您没有安装此密钥，请不要继续。',
  'Continue': '继续',
  'Cancel': '取消',
  'This is the API key you configured for': '这是您为以下地址配置的 API 密钥：',
  'This is a custom API key for': '这是为以下地址配置的自定义 API 密钥：',
  'API key': 'API 密钥',
  'Proceed': '继续',
  'Are you sure you want to use this API key?': '您确定要使用此 API 密钥吗？',
  'This key will be used for': '此密钥将用于以下地址：',
  'Save': '保存',
  'Use this key': '使用此密钥',
  'Cancel using this key': '取消使用此密钥',
  
  // CustomSelect/index.tsx
  'Select': '选择',
  'Custom select': '自定义选择',
  'Type to search...': '输入以搜索…',
  'No results found': '未找到结果',
  'Select an option': '选择一个选项',
  'Enter': '回车',
  'Esc': 'Esc',
  'Clear selection': '清除选择',
  
  // BridgeDialog.tsx
  'd to disconnect · space for QR code · Enter/Esc to close': 'd 断开连接 · 空格显示二维码 · Enter/Esc 关闭',
  'Environment:': '环境',
  'Session:': '会话',
  'Failed to connect': '连接失败',
  'Connecting...': '连接中…',
  'Connected': '已连接',
  'Disconnecting...': '断开连接中…',
  'Disconnected': '已断开',
  'Status:': '状态：',
  'Active': '活动',
  'Inactive': '不活动',
  'Ready': '就绪',
  'Error:': '错误：',
  'Failed to connect to the bridge': '连接到桥接失败',
  'Bridge is ready': '桥接已就绪',
  'Bridge is not connected': '桥接未连接',
  'Click to reconnect': '点击重新连接',
  'Copy URL': '复制 URL',
  'Open in browser': '在浏览器中打开',
  'QR Code': '二维码',
  'Scan with your phone': '使用您的手机扫描',
  'Bridge URL': '桥接 URL',
  
  // ExportDialog.tsx
  '复制到剪贴板': '复制到剪贴板',
  '保存到文件': '保存到文件',
  '将对话复制到系统剪贴板': '将对话复制到系统剪贴板',
  '将对话保存到当前目录的文件': '将对话保存到当前目录的文件',
  '导出对话': '导出对话',
  '选择导出方式：': '选择导出方式：',
  '输入文件名：': '输入文件名：',
  
  // 通用翻译
  'Custom': '自定义',
  'Default': '默认',
  'All': '全部',
  'None': '无',
  'Apply': '应用',
  'Save changes': '保存更改',
  'Cancel changes': '取消更改',
  'Confirm': '确认',
  'Discard': '丢弃',
  'Retry': '重试',
  'Skip': '跳过',
  'View': '查看',
  'Edit': '编辑',
  'Delete': '删除',
  'Create': '创建',
  'Update': '更新',
  'Restore': '恢复',
  'Backup': '备份',
  'Restart': '重启',
  'Close': '关闭',
  'Open': '打开',
  'Exit': '退出',
  'Help': '帮助',
  'About': '关于',
  'Version': '版本',
  'Info': '信息',
  'Description': '描述',
  'Example': '示例',
  'Note': '注意',
  'Warning': '警告',
  'Error': '错误',
  'Success': '成功',
  'Cancel': '取消',
  'Confirm': '确认',
  'Back': '返回',
  'Continue': '继续',
  'Stop': '停止',
  'Pause': '暂停',
  'Complete': '完成',
  'Loading': '加载中',
  'Saving': '保存中',
  'Deleting': '删除中',
  'Updating': '更新中',
  'Creating': '创建中',
  'Setting': '设置',
  'Configuration': '配置',
  'Permission': '权限',
  'Login': '登录',
  'Logout': '退出',
  'Help': '帮助',
  'About': '关于',
  'Version': '版本',
  'Info': '信息',
  'Description': '描述',
  'Example': '示例',
  'Note': '注意',
  'Warning': '警告',
  'Error': '错误',
  'Success': '成功',
  'Cancel': '取消',
  'Confirm': '确认',
  'Back': '返回',
  'Continue': '继续',
  'Stop': '停止',
  'Pause': '暂停',
  'Complete': '完成',
  'Retry': '重试',
  'Skip': '跳过',
  'Overwrite': '覆盖',
  'Restore': '恢复',
  'Backup': '备份',
  'Restart': '重启',
  'Cloud': '云端',
  'Direct connect': '直接连接',
  'Server': '服务器',
  'Connection': '连接',
  'Session': '会话',
  'Message': '消息',
  'Notification': '通知',
  'Information': '信息',
  'Unknown': '未知',
  'Loading': '加载中',
  'Saving': '保存中',
  'Deleting': '删除中',
  'Updating': '更新中',
  'Creating': '创建中',
  'Setting': '设置',
  'Configuration': '配置',
  'Permission': '权限',
  'Login': '登录',
  'Logout': '退出',
  'Help': '帮助',
  'About': '关于',
  'Version': '版本',
  'Info': '信息',
  'Description': '描述',
  'Example': '示例',
  'Note': '注意',
  'Warning': '警告',
  'Error': '错误',
  'Success': '成功',
  'Cancel': '取消',
  'Confirm': '确认',
  'Back': '返回',
  'Continue': '继续',
  'Stop': '停止',
  'Pause': '暂停',
  'Complete': '完成',
  'Retry': '重试',
  'Skip': '跳过',
  'Overwrite': '覆盖',
  'Restore': '恢复',
  'Backup': '备份',
  'Restart': '重启',
};

// 执行翻译
async function translateFile(filePath: string) {
  try {
    const fullPath = `src/${filePath}`;
    const content = readFileSync(fullPath, 'utf-8');
    let translated = content;

    // 应用所有翻译
    for (const [english, chinese] of Object.entries(translations)) {
      // 转义特殊字符以构建有效的正则表达式
      const escapedEnglish = english.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      translated = translated.replace(new RegExp(escapedEnglish, 'g'), chinese);
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
  console.log('开始汉化（第三阶段）...\n');

  for (const file of filesToTranslate) {
    await translateFile(file);
  }

  console.log('\n汉化完成！');
}

main();