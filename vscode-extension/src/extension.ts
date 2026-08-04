// ============================================================================
// Doge Code VS Code 扩展
// 提供聊天界面、用量统计和代码补全功能
// ============================================================================

import * as vscode from 'vscode'
import * as http from 'http'

// ============================================================================
// 扩展激活
// ============================================================================

export function activate(context: vscode.ExtensionContext) {
  console.log('Doge Code 扩展已激活')

  // 注册命令：打开聊天
  const openChatCmd = vscode.commands.registerCommand('doge-code.openChat', () => {
    const panel = vscode.window.createWebviewPanel(
      'dogeCodeChat',
      'Doge Code 聊天',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    )
    panel.webview.html = getChatHTML(panel.webview, context)

    // 处理来自 webview 的消息
    panel.webview.onDidReceiveMessage(
      message => {
        switch (message.command) {
          case 'sendMessage':
            handleSendMessage(panel.webview, message.text)
            break
          case 'refreshStats':
            refreshStats(panel.webview)
            break
        }
      },
      undefined,
      context.subscriptions
    )

    // 初始化时加载统计
    refreshStats(panel.webview)
  })

  // 注册命令：显示统计
  const showStatsCmd = vscode.commands.registerCommand('doge-code.showStats', async () => {
    const config = vscode.workspace.getConfiguration('doge-code')
    const serverUrl = config.get<string>('serverUrl', 'http://127.0.0.1:3456')

    try {
      const response = await httpGet(`${serverUrl}/api/stats`)
      const data = JSON.parse(response)
      vscode.window.showInformationMessage(
        `💰 总费用: $${data.stats.totalCostUSD.toFixed(4)} | 📊 Token: ${(data.stats.totalTokens.input + data.stats.totalTokens.output).toLocaleString()}`
      )
    } catch (err) {
      vscode.window.showErrorMessage('❌ 无法连接到 Doge Code 服务器，请先启动仪表盘 (/dashboard open)')
    }
  })

  context.subscriptions.push(openChatCmd, showStatsCmd)
}

// ============================================================================
// 扩展停用
// ============================================================================

export function deactivate() {
  console.log('Doge Code 扩展已停用')
}

// ============================================================================
// HTTP 请求辅助函数
// ============================================================================

function httpGet(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => resolve(data))
    }).on('error', reject)
  })
}

function httpPost(url: string, body: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url)
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }
    const req = http.request(options, res => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => resolve(data))
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

// ============================================================================
// 发送消息到 Doge Code 服务器
// ============================================================================

async function handleSendMessage(webview: vscode.Webview, text: string) {
  const config = vscode.workspace.getConfiguration('doge-code')
  const serverUrl = config.get<string>('serverUrl', 'http://127.0.0.1:3456')

  try {
    // 发送用户消息到服务器
    const response = await httpGet(`${serverUrl}/api/stats`)
    const data = JSON.parse(response)

    // 返回响应给 webview
    webview.postMessage({
      command: 'receiveMessage',
      text: `已收到: ${text}\n当前总费用: $${data.stats.totalCostUSD.toFixed(4)}`,
      isUser: false
    })
  } catch (err) {
    webview.postMessage({
      command: 'receiveMessage',
      text: `❌ 错误: 无法连接到服务器 (${serverUrl})`,
      isUser: false
    })
  }
}

// ============================================================================
// 刷新统计数据
// ============================================================================

async function refreshStats(webview: vscode.Webview) {
  const config = vscode.workspace.getConfiguration('doge-code')
  const serverUrl = config.get<string>('serverUrl', 'http://127.0.0.1:3456')

  try {
    const response = await httpGet(`${serverUrl}/api/stats`)
    const data = JSON.parse(response)
    webview.postMessage({
      command: 'updateStats',
      stats: data.stats,
      modelUsage: data.modelUsage
    })
  } catch (err) {
    webview.postMessage({
      command: 'updateStats',
      error: true
    })
  }
}

// ============================================================================
// 聊天界面 HTML
// ============================================================================

function getChatHTML(webview: vscode.Webview, context: vscode.ExtensionContext): string {
  const cspSource = webview.cspSource

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src ${cspSource} 'unsafe-inline';">
  <title>Doge Code 聊天</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: var(--vscode-editor-background); color: var(--vscode-editor-foreground); display: flex; flex-direction: column; height: 100vh; }

    /* 顶部状态栏 */
    .header { display: flex; justify-content: space-between; align-items: center; padding: 10px 15px; border-bottom: 1px solid var(--vscode-panel-border); }
    .header h1 { font-size: 14px; color: var(--vscode-textLink-foreground); }
    .status { font-size: 11px; padding: 2px 8px; border-radius: 10px; }
    .status.connected { background: var(--vscode-testing-iconPassed); color: white; }
    .status.disconnected { background: var(--vscode-errorForeground); color: white; }

    /* 统计栏 */
    .stats-bar { display: flex; gap: 15px; padding: 8px 15px; border-bottom: 1px solid var(--vscode-panel-border); font-size: 11px; }
    .stats-item { display: flex; align-items: center; gap: 4px; }
    .stats-item .label { color: var(--vscode-descriptionForeground); }
    .stats-item .value { font-weight: 600; }
    .value.cost { color: var(--vscode-testing-iconPassed); }
    .value.tokens { color: var(--vscode-textLink-foreground); }

    /* 聊天区域 */
    .chat-container { flex: 1; overflow-y: auto; padding: 15px; display: flex; flex-direction: column; gap: 10px; }
    .message { max-width: 80%; padding: 8px 12px; border-radius: 8px; font-size: 13px; line-height: 1.5; word-wrap: break-word; }
    .message.user { align-self: flex-end; background: var(--vscode-textLink-foreground); color: white; }
    .message.assistant { align-self: flex-start; background: var(--vscode-input-background); border: 1px solid var(--vscode-panel-border); }
    .message.error { align-self: center; background: var(--vscode-inputValidation-errorBackground); border: 1px solid var(--vscode-errorForeground); }

    /* 输入区域 */
    .input-container { display: flex; gap: 8px; padding: 10px 15px; border-top: 1px solid var(--vscode-panel-border); }
    .input-container input { flex: 1; padding: 8px 12px; border: 1px solid var(--vscode-input-border); border-radius: 4px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); font-size: 13px; outline: none; }
    .input-container input:focus { border-color: var(--vscode-textLink-foreground); }
    .input-container button { padding: 8px 16px; background: var(--vscode-textLink-foreground); color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 13px; }
    .input-container button:hover { opacity: 0.9; }
    .input-container button:disabled { opacity: 0.5; cursor: not-allowed; }

    /* 空状态 */
    .empty-state { text-align: center; padding: 40px 20px; color: var(--vscode-descriptionForeground); }
    .empty-state h2 { font-size: 18px; margin-bottom: 10px; }
    .empty-state p { font-size: 13px; line-height: 1.6; }
  </style>
</head>
<body>
  <!-- 顶部状态栏 -->
  <div class="header">
    <h1>🐕 Doge Code 聊天</h1>
    <span id="status" class="status disconnected">未连接</span>
  </div>

  <!-- 统计栏 -->
  <div class="stats-bar">
    <div class="stats-item">
      <span class="label">💰 费用:</span>
      <span id="stat-cost" class="value cost">$0.0000</span>
    </div>
    <div class="stats-item">
      <span class="label">📊 Token:</span>
      <span id="stat-tokens" class="value tokens">0</span>
    </div>
    <div class="stats-item">
      <span class="label">📈 缓存:</span>
      <span id="stat-cache" class="value tokens">0</span>
    </div>
  </div>

  <!-- 聊天区域 -->
  <div id="chat" class="chat-container">
    <div class="empty-state">
      <h2>🐕 你好！我是 Doge Code</h2>
      <p>输入你的问题开始对话</p>
      <p style="margin-top: 10px; font-size: 11px;">提示: 使用 /dashboard open 启动仪表盘获取实时统计</p>
    </div>
  </div>

  <!-- 输入区域 -->
  <div class="input-container">
    <input id="messageInput" type="text" placeholder="输入消息... (Enter 发送)" />
    <button id="sendBtn" onclick="sendMessage()">发送</button>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const chat = document.getElementById('chat');
    const input = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendBtn');
    const statusEl = document.getElementById('status');
    const costEl = document.getElementById('stat-cost');
    const tokensEl = document.getElementById('stat-tokens');
    const cacheEl = document.getElementById('stat-cache');

    let messageCount = 0;

    // 发送消息
    function sendMessage() {
      const text = input.value.trim();
      if (!text) return;

      // 添加用户消息
      addMessage(text, true);
      input.value = '';

      // 发送到扩展
      vscode.postMessage({ command: 'sendMessage', text });
    }

    // 添加消息到聊天
    function addMessage(text, isUser) {
      // 移除空状态
      const empty = chat.querySelector('.empty-state');
      if (empty) empty.remove();

      const msg = document.createElement('div');
      msg.className = 'message ' + (isUser ? 'user' : 'assistant');
      msg.textContent = text;
      chat.appendChild(msg);
      chat.scrollTop = chat.scrollHeight;
      messageCount++;
    }

    // 处理来自扩展的消息
    window.addEventListener('message', event => {
      const message = event.data;
      switch (message.command) {
        case 'receiveMessage':
          addMessage(message.text, false);
          break;
        case 'updateStats':
          if (message.error) {
            statusEl.textContent = '连接失败';
            statusEl.className = 'status disconnected';
          } else {
            statusEl.textContent = '已连接';
            statusEl.className = 'status connected';
            costEl.textContent = '$' + message.stats.totalCostUSD.toFixed(4);
            tokensEl.textContent = (message.stats.totalTokens.input + message.stats.totalTokens.output).toLocaleString();
            cacheEl.textContent = message.stats.totalTokens.cacheRead.toLocaleString();
          }
          break;
      }
    });

    // Enter 发送
    input.addEventListener('keypress', e => {
      if (e.key === 'Enter') sendMessage();
    });

    // 初始刷新统计
    vscode.postMessage({ command: 'refreshStats' });
  </script>
</body>
</html>`
}
