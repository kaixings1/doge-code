/**
 * 将运行本进程的终端窗口切换到前台。
 *
 * 使用场景：任务完成或需要用户干预时，除了标题栏绿方块与提示音，
 * 还需把终端窗口从后台拉到前台，否则用户在多窗口场景下可能错过。
 *
 * 为什么按标题匹配而非进程链：
 * 实测（Windows Terminal / conhost）终端窗口不属于 node/bun 进程，
 * 沿 ParentProcessId 上溯会走到 cmd.exe → explorer.exe（桌面窗口），
 * 拿到的是错误的句柄。而本程序会通过 OSC 0 把含 sessionId 的标题写入
 * 终端，该标题正是窗口标题——用 sessionId 匹配即可精确定位到自己的窗口，
 * 且天然支持多开场景。匹配失败时回退到"最近激活的终端类窗口"。
 *
 * 失败永远静默：窗口激活是尽力而为的增强，绝不能让通知链路抛错。
 */

import { execFileNoThrow } from './execFileNoThrow.js'

// 同一轮通知可能连续触发（waiting 紧随 busy→idle），避免重复拉窗口
let lastActivateAt = 0
const ACTIVATE_THROTTLE_MS = 1500

/**
 * 构造 Windows 侧的 PowerShell 脚本。
 *
 * 匹配策略（按优先级）：
 * 1. 标题包含 sessionId —— 本会话自己的窗口，最精确
 * 2. 标题包含 "doge" / "Claude" —— 本程序的其他窗口
 * 3. 回退：最近激活的 WindowsTerminal / conhost 窗口
 *
 * SetForegroundWindow 受前台锁限制，用 AttachThreadInput 把输入队列
 * 接到目标线程来绕过——这是 Windows 上把窗口强制拉到前台的常规做法。
 */
function buildWindowsActivateScript(sessionId: string): string {
  // sessionId 来自程序内部生成的 UUID，仍需转义为安全的 PS 单引号字面量
  const safeSid = sessionId.replace(/'/g, "''")
  return [
    '$OutputEncoding=[Console]::OutputEncoding=[Text.Encoding]::UTF8',
    '$sig=@"',
    '[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);',
    '[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int n);',
    '[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();',
    '[DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);',
    '[DllImport("user32.dll")] public static extern bool AttachThreadInput(uint a, uint b, bool f);',
    '[DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();',
    '[DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowTextW(IntPtr h, System.Text.StringBuilder s, int n);',
    '[DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);',
    '[DllImport("user32.dll")] public static extern bool FlashWindowEx(ref FLASHWINFO f);',
    '[StructLayout(LayoutKind.Sequential)] public struct FLASHWINFO { public uint cbSize; public IntPtr hwnd; public uint dwFlags; public uint uCount; public uint dwTimeout; }',
    '"@',
    'Add-Type -MemberDefinition $sig -Name Win -Namespace Dg | Out-Null',
    `$sid='${safeSid}'`,
    '$cands=@()',
    'Get-Process | Where-Object { $_.MainWindowHandle -ne 0 } | ForEach-Object {',
    '  if(-not [Dg.Win]::IsWindowVisible($_.MainWindowHandle)){return}',
    '  $sb=New-Object System.Text.StringBuilder 512',
    '  [Dg.Win]::GetWindowTextW($_.MainWindowHandle,$sb,512) | Out-Null',
    '  $title=$sb.ToString()',
    '  $score=-1',
    '  if($sid -and $title -like "*$sid*"){$score=100}',
    '  elseif($title -notmatch "doge-bridge|bridge\.ts" -and $title -match "doge|Claude"){$score=50}',
    '  elseif($_.ProcessName -match "WindowsTerminal|conhost|cmd|powershell|pwsh"){$score=10}',
    '  if($score -ge 0){$script:cands+=[pscustomobject]@{Score=$score;Hwnd=$_.MainWindowHandle;Title=$title}}',
    '}',
    'if($cands.Count -eq 0){exit 1}',
    '$h=($cands | Sort-Object -Property Score -Descending | Select-Object -First 1).Hwnd',
    'if([Dg.Win]::GetForegroundWindow() -eq $h){exit 0}',
    '$fg=[Dg.Win]::GetForegroundWindow()',
    '$fpid=0',
    '$fgThread=[Dg.Win]::GetWindowThreadProcessId($fg,[ref]$fpid)',
    '$curThread=[Dg.Win]::GetCurrentThreadId()',
    'if($fgThread -ne 0){[Dg.Win]::AttachThreadInput($curThread,$fgThread,$true) | Out-Null}',
    '[Dg.Win]::ShowWindow($h,9) | Out-Null',
    '$ok=[Dg.Win]::SetForegroundWindow($h)',
    'if($fgThread -ne 0){[Dg.Win]::AttachThreadInput($curThread,$fgThread,$false) | Out-Null}',
    // 置顶失败时的降级：Windows 的前台锁会拒绝非前台进程抢焦点（防恶意弹窗）。
    // 此时用 FlashWindowEx 闪烁任务栏图标——不抢焦点，但足以引起注意。
    // FLASHW_ALL(3) | FLASHW_TIMERNOFG(12) = 持续闪烁直到窗口被激活
    'if(-not $ok){',
    '  $fi=New-Object Dg.Win+FLASHWINFO',
    '  $fi.cbSize=[Runtime.InteropServices.Marshal]::SizeOf($fi)',
    '  $fi.hwnd=$h',
    '  $fi.dwFlags=3 -bor 12',
    '  $fi.uCount=0',
    '  $fi.dwTimeout=0',
    '  [Dg.Win]::FlashWindowEx([ref]$fi) | Out-Null',
    '}',
    'exit 0',
  ].join('\n')
}

async function activateWindows(sessionId: string): Promise<void> {
  await execFileNoThrow(
    'powershell',
    [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      buildWindowsActivateScript(sessionId),
    ],
    { timeout: 3000 },
  )
}

async function activateDarwin(): Promise<void> {
  // 唤醒最前台的终端类应用；不存在的应用 osascript 报错但不影响其他分支
  await execFileNoThrow(
    'osascript',
    ['-e', 'tell application "System Events" to set frontmost of (first process whose frontmost is true) to true'],
    { timeout: 2000 },
  )
}

/**
 * 尽力把终端窗口切到前台。串行节流，失败静默。
 *
 * @param sessionId 当前会话 ID，用于按窗口标题精确定位本会话的终端
 * @returns 是否真正发起了激活尝试（被节流或平台不支持时返回 false）
 */
export async function focusTerminalWindow(sessionId?: string): Promise<boolean> {
  const now = Date.now()
  if (now - lastActivateAt < ACTIVATE_THROTTLE_MS) {
    return false
  }
  lastActivateAt = now

  try {
    if (process.platform === 'win32') {
      await activateWindows(sessionId ?? '')
      return true
    }
    if (process.platform === 'darwin') {
      await activateDarwin()
      return true
    }
    return false
  } catch {
    return false
  }
}
