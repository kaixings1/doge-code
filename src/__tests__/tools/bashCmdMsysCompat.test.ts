import { describe, expect, test } from 'vitest'
import {
  normalizeUnixCommandForWindows,
  fixMsysDoubleSlashSwitches,
} from '../../tools/BashTool/BashTool.js'

// 只验证 MSYS2 的 `cmd //c` 兼容分支；其余归一化行为由既有逻辑保证。
// 该函数在非 win32 平台直接 return 原串，若在 Linux CI 上运行，
// 所有「应被纠正」的用例都会因恒等而失败（或反之被误判为覆盖）。
// 显式跳过并说明原因，避免 CI 上得到误导性结果。
const isWindows = process.platform === 'win32'
describe.skipIf(!isWindows)('normalizeUnixCommandForWindows — MSYS2 cmd 兼容', () => {
  test('cmd //c 被纠正为 cmd /c', () => {
    expect(normalizeUnixCommandForWindows('cmd //c "dir /b x.md"')).toBe(
      'cmd /c "dir /b x.md"',
    )
  })

  test('cmd //d //c 保留 /d 并纠正 //c', () => {
    expect(normalizeUnixCommandForWindows('cmd //d //c "ver"')).toBe(
      'cmd /d /c "ver"',
    )
  })

  test('多段命令中的 cmd //c 同样纠正', () => {
    expect(
      normalizeUnixCommandForWindows('cd "D:/x" && cmd //c "dir /b"'),
    ).toBe('cd "D:/x" && cmd /c "dir /b"')
  })

  // 反向：不应改动已经正确的写法
  test('cmd /c 保持原样', () => {
    expect(normalizeUnixCommandForWindows('cmd /c "dir /b"')).toBe(
      'cmd /c "dir /b"',
    )
  })

  // 大小写：命令名与开关字母都不应受大小写影响
  test('大写命令名 CMD 同样纠正', () => {
    expect(normalizeUnixCommandForWindows('CMD //c "dir /b"')).toBe(
      'CMD /c "dir /b"',
    )
  })

  test('大小写混合的 cmd.exe 同样纠正', () => {
    expect(normalizeUnixCommandForWindows('Cmd.Exe //D //C "ver"')).toBe(
      'Cmd.Exe /D /C "ver"',
    )
  })

  test('大写开关字母 //C 同样纠正', () => {
    expect(normalizeUnixCommandForWindows('cmd //C "dir /b"')).toBe(
      'cmd /C "dir /b"',
    )
  })

  test('大写 //D //C 顺序保留并纠正', () => {
    expect(normalizeUnixCommandForWindows('cmd //D //C "ver"')).toBe(
      'cmd /D /C "ver"',
    )
  })

  // powershell / pwsh：同为 MSYS 双斜杠陷阱
  test('powershell //Command 被纠正', () => {
    expect(
      normalizeUnixCommandForWindows('powershell //Command "Get-Date"'),
    ).toBe('powershell /Command "Get-Date"')
  })

  test('powershell 的 //NoProfile //Command 组合被纠正', () => {
    expect(
      normalizeUnixCommandForWindows('powershell //NoProfile //Command "ls"'),
    ).toBe('powershell /NoProfile /Command "ls"')
  })

  test('pwsh 大写 //C 同样纠正', () => {
    expect(normalizeUnixCommandForWindows('pwsh //C "Get-Date"')).toBe(
      'pwsh /C "Get-Date"',
    )
  })

  test('powershell -Command 正规写法保持原样', () => {
    expect(
      normalizeUnixCommandForWindows('powershell -Command "Get-Date"'),
    ).toBe('powershell -Command "Get-Date"')
  })

  // wsl
  test('wsl //e 被纠正为 wsl /e', () => {
    expect(normalizeUnixCommandForWindows('wsl //e ls -la')).toBe(
      'wsl /e ls -la',
    )
  })

  test('wsl //d //u 组合被纠正', () => {
    expect(normalizeUnixCommandForWindows('wsl //d Ubuntu //u root')).toBe(
      'wsl /d Ubuntu /u root',
    )
  })

  test('wsl --distribution 长选项保持原样', () => {
    expect(
      normalizeUnixCommandForWindows('wsl --distribution Ubuntu -- ls'),
    ).toBe('wsl --distribution Ubuntu -- ls')
  })

  // 反向：纠正只对上述 shell 生效，其他命令的 // 参数必须原样保留
  test('非受控命令的 // 参数不受影响', () => {
    expect(normalizeUnixCommandForWindows('echo //not-a-switch')).toBe(
      'echo //not-a-switch',
    )
  })

  test('非受控命令的 //c 参数不被改动', () => {
    expect(normalizeUnixCommandForWindows('some-tool //c x')).toBe(
      'some-tool //c x',
    )
  })

  test('Unix 命令映射仍然生效', () => {
    expect(normalizeUnixCommandForWindows('ls docs')).toBe('dir docs')
  })
})

// 共享的 MSYS 双斜杠纠正函数（fixMsysDoubleSlashSwitches）。
// 此前该纠正只在 Unix→Windows 路径（底层 shell 是 cmd/powershell）做，
// bash 路径（normalizeWindowsCommand）漏做，导致 `cmd //c` 在 MSYS2/Git Bash 下
// 触发 UNC 路径陷阱 → cmd 进交互模式挂起（表现为"命令卡死"）。
// 提取为共享函数后两条路径共用，本块覆盖 bash 路径形态 + 回归守卫。
describe.skipIf(!isWindows)('fixMsysDoubleSlashSwitches — bash 路径覆盖', () => {
  // 真实卡死形态：多层嵌套 + 反斜杠路径 + 后续 tail 管道
  test('嵌套 cmd //c 在 && ; 多段命令中被纠正', () => {
    expect(
      fixMsysDoubleSlashSwitches(
        'cd D:/Agent/MyAgent && cmd //c runtime\\_run_pytest.cmd; tail -6 runtime/_pytest.txt',
      ),
    ).toBe(
      'cd D:/Agent/MyAgent && cmd /c runtime\\_run_pytest.cmd; tail -6 runtime/_pytest.txt',
    )
  })

  test('裸 cmd //c 被纠正', () => {
    expect(fixMsysDoubleSlashSwitches('cmd //c runtime\\_run_pytest.cmd')).toBe(
      'cmd /c runtime\\_run_pytest.cmd',
    )
  })

  test('带引号路径的 cmd //c 被纠正', () => {
    expect(
      fixMsysDoubleSlashSwitches('cmd //c "runtime\\_run_pytest.cmd"'),
    ).toBe('cmd /c "runtime\\_run_pytest.cmd"')
  })

  // 多开关顺序保留
  test('cmd //d //c 保留 /d 并纠正 //c', () => {
    expect(fixMsysDoubleSlashSwitches('cmd //d //c "ver"')).toBe(
      'cmd /d /c "ver"',
    )
  })

  // 反向守卫：不应改动已经正确的写法
  test('cmd /c 保持原样', () => {
    expect(fixMsysDoubleSlashSwitches('cmd /c "dir /b"')).toBe('cmd /c "dir /b"')
  })

  // 反向守卫：非受控命令的 // 参数必须原样保留
  test('非受控命令的 // 参数不受影响', () => {
    expect(fixMsysDoubleSlashSwitches('echo //not-a-switch')).toBe(
      'echo //not-a-switch',
    )
  })

  // 反向守卫：应保留后续管道/重定向中的 //（不属于受控 shell 首 token）
  test('后续段的非受控 // 不受影响', () => {
    expect(fixMsysDoubleSlashSwitches('cmd /c x && echo //y')).toBe(
      'cmd /c x && echo //y',
    )
  })
})
