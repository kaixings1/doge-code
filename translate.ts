/**
 * 批量汉化源代码中的英文用户提示信息
 * 执行方式: bun run translate.ts
 */

// 需要汉化的文件列表（文件路径相对于 src/ 目录）
const filesToTranslate = [
  'bridge/replBridge.ts',
  'bridge/workSecret.ts',
  'bridge/bridgeMessaging.ts',
  'server/directConnectManager.ts',
  'cli/print.ts',
  'memdir/memdir.ts',
  'keybindings/schema.ts',
  'assistant/index.ts',
];

// 翻译映射表
const translations: Record<string, string> = {
  // bridge/replBridge.ts
  'Failed to decode work secret': '解码工作密钥失败',
  'Failed to parse ingress message': '解析入站消息失败',
  'Unknown subtype': '未知子类型',
  'hang waiting for a reply that never comes': '挂起等待永远不会回来的回复',
  'Invalid session_id in work': '工作密钥中的 session_id 无效',
  'Failed to persist token': '持久化令牌失败',
  'session_ingress_token': '会话入口令牌',
  'api_base_url': 'API 基础 URL',
  'Invalid work secret': '无效的工作密钥',
  'registerWorker': '注册 worker',
  'worker_epoch': 'worker 周期',
  'invalid': '无效',
  'response中的 worker_epoch 无效': '响应中的 worker_epoch 无效',
  
  // server/directConnectManager.ts
  'WebSocket connection error': 'WebSocket 连接错误',
  'Unsupported control request subtype': '不支持的控制请求子类型',
  'not implemented': '未实现',
  'session expired': '会话已过期',
  'invalid session': '无效会话',
  'authentication failed': '认证失败',
  'connection failed': '连接失败',
  'session creation failed': '创建会话失败',
  'invalid response': '无效响应',
  'direct connect': '直接连接',
  'server': '服务器',
  'connection': '连接',
  'session': '会话',
  'error': '错误',
  'warning': '警告',
  'message': '消息',
  'notification': '通知',
  'information': '信息',
  
  // 其他通用翻译
  'unknown': '未知',
  'loading': '加载中',
  'saving': '保存中',
  'deleting': '删除中',
  'updating': '更新中',
  'creating': '创建中',
  'setting': '设置',
  'configuration': '配置',
  'permission': '权限',
  'login': '登录',
  'logout': '退出',
  'help': '帮助',
  'about': '关于',
  'version': '版本',
  'info': '信息',
  'description': '描述',
  'example': '示例',
  'note': '注意',
  'warning': '警告',
  'error': '错误',
  'success': '成功',
  'cancel': '取消',
  'confirm': '确认',
  'back': '返回',
  'continue': '继续',
  'stop': '停止',
  'pause': '暂停',
  'complete': '完成',
  'retry': '重试',
  'skip': '跳过',
  'overwrite': '覆盖',
  'restore': '恢复',
  'backup': '备份',
  'restart': '重启',
};

// 执行翻译
async function translateFile(filePath: string) {
  const fullPath = `src/${filePath}`;
  try {
    const content = await Bun.file(fullPath).text();
    let translated = content;
    
    // 应用所有翻译
    for (const [english, chinese] of Object.entries(translations)) {
      translated = translated.replace(new RegExp(english, 'g'), chinese);
    }
    
    // 写回文件
    if (translated !== content) {
      await Bun.write(fullPath, translated);
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
  console.log('开始汉化...\n');
  
  for (const file of filesToTranslate) {
    await translateFile(file);
  }
  
  console.log('\n汉化完成！');
}

main();