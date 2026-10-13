/**
 * 手机端远程配置的白名单与校验测试。
 *
 * **这是安全边界测试**，不是普通功能测试。手机端是网络可达的控制面：
 * 一个落在别人手里的手机（或同一 WiFi 下的任意设备，当密钥未设时）
 * 能改什么，完全由这里的白名单决定。
 *
 * 最关键的一条：**绝不暴露 bypassPermissions**。
 * 本地 CLI 常以 --dangerously-skip-permissions 运行（见 mobile.bat），
 * 若原样透传，等于把「跳过全部权限」这个已被显式标记 dangerous 的开关
 * 放到网络上 —— 拿到手机即可关掉本机防护。
 * Claude 官方移动端同样不开放此项。
 *
 * 变异验证：删掉 validateMobileConfig 里的 bypassPermissions 分支，
 * 「bypassPermissions 被拒绝」用例必然失败。
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  validateMobileConfig,
  MOBILE_ALLOWED_PERMISSION_MODES,
  MOBILE_ALLOWED_THINKING_TOKENS,
} from '../../src/bridge/mobileConfig.js'
import {
  applyMobileConfig,
  setMobileConfigHandlers,
  hasMobileConfigHandlers,
} from '../../src/bridge/mobileBridge.js'

afterEach(() => {
  setMobileConfigHandlers(null)
})

describe('validateMobileConfig — 权限模式（安全关键）', () => {
  it('bypassPermissions 被明确拒绝', () => {
    const r = validateMobileConfig('permissionMode', 'bypassPermissions')
    expect(r.ok, '手机端绝不允许切换到跳过权限模式').toBe(false)
    // 错误信息要说清是「有意的限制」而非 bug，否则用户会反复尝试
    expect(r.error).toContain('安全')
  })

  it.each(['default', 'plan', 'acceptEdits', 'auto'])('%s 被允许', m => {
    expect(validateMobileConfig('permissionMode', m).ok).toBe(true)
  })

  it('白名单本身不含 bypassPermissions', () => {
    // 双重保险：即使上面的分支被误删，这条也会拦住
    expect(MOBILE_ALLOWED_PERMISSION_MODES as readonly string[]).not.toContain('bypassPermissions')
  })

  it('未知权限模式被拒绝', () => {
    expect(validateMobileConfig('permissionMode', 'yolo').ok).toBe(false)
    expect(validateMobileConfig('permissionMode', '').ok).toBe(false)
  })

  it('非字符串权限模式被拒绝', () => {
    expect(validateMobileConfig('permissionMode', 123).ok).toBe(false)
    expect(validateMobileConfig('permissionMode', null).ok).toBe(false)
    expect(validateMobileConfig('permissionMode', {}).ok).toBe(false)
  })

  it('大小写变体不被误放行', () => {
    // 'BypassPermissions' 不是白名单成员，必须拒绝；
    // 若上游做了大小写归一化，这里就会成为绕过口
    expect(validateMobileConfig('permissionMode', 'BypassPermissions').ok).toBe(false)
    expect(validateMobileConfig('permissionMode', 'bypasspermissions').ok).toBe(false)
  })
})

describe('validateMobileConfig — 资源与进程守卫', () => {
  it('思考强度只接受白名单值', () => {
    for (const v of MOBILE_ALLOWED_THINKING_TOKENS) {
      expect(validateMobileConfig('thinkingTokens', v).ok, `${v} 应被允许`).toBe(true)
    }
  })

  it('白名单外的思考强度被拒绝（防超大值耗尽配额）', () => {
    expect(validateMobileConfig('thinkingTokens', 999999999).ok).toBe(false)
    expect(validateMobileConfig('thinkingTokens', -1).ok).toBe(false)
    expect(validateMobileConfig('thinkingTokens', 1).ok).toBe(false)
  })

  it('非整数思考强度被拒绝', () => {
    expect(validateMobileConfig('thinkingTokens', 1.5).ok).toBe(false)
    expect(validateMobileConfig('thinkingTokens', '4096').ok).toBe(false)
    expect(validateMobileConfig('thinkingTokens', NaN).ok).toBe(false)
  })

  it('0 是合法值（表示关闭思考）', () => {
    expect(validateMobileConfig('thinkingTokens', 0).ok).toBe(true)
  })
})

describe('validateMobileConfig — 模型', () => {
  it('常见模型名被允许', () => {
    expect(validateMobileConfig('model', 'claude-sonnet-4-6').ok).toBe(true)
    expect(validateMobileConfig('model', 'claude-opus-4-6').ok).toBe(true)
    expect(validateMobileConfig('model', 'sonnet').ok).toBe(true)
  })

  it('default 与 null 表示恢复默认', () => {
    expect(validateMobileConfig('model', 'default').ok).toBe(true)
    expect(validateMobileConfig('model', null).ok).toBe(true)
  })

  it('含非法字符的模型名被拒绝（注入面）', () => {
    expect(validateMobileConfig('model', 'a b; rm -rf /').ok).toBe(false)
    expect(validateMobileConfig('model', '../../etc/passwd').ok).toBe(false)
    expect(validateMobileConfig('model', 'model\nname').ok).toBe(false)
    expect(validateMobileConfig('model', '$(whoami)').ok).toBe(false)
  })

  it('超长模型名被拒绝', () => {
    expect(validateMobileConfig('model', 'x'.repeat(200)).ok).toBe(false)
  })

  it('非字符串模型名被拒绝', () => {
    expect(validateMobileConfig('model', 42).ok).toBe(false)
    expect(validateMobileConfig('model', {}).ok).toBe(false)
  })
})

describe('validateMobileConfig — 未知配置项', () => {
  it('未登记的配置项一律拒绝（白名单而非黑名单）', () => {
    // 白名单的意义：CLI 新增命令时默认拒绝，而非默认放行
    expect(validateMobileConfig('dangerouslySkipPermissions', true).ok).toBe(false)
    expect(validateMobileConfig('apiKey', 'x').ok).toBe(false)
    expect(validateMobileConfig('cwd', '/').ok).toBe(false)
    expect(validateMobileConfig('', 'x').ok).toBe(false)
  })

  it('非字符串配置项名被拒绝', () => {
    expect(validateMobileConfig(123, 'x').ok).toBe(false)
    expect(validateMobileConfig(null, 'x').ok).toBe(false)
    expect(validateMobileConfig(undefined, 'x').ok).toBe(false)
  })
})

describe('applyMobileConfig — 回调未注册时的行为', () => {
  it('未注册回调时明确报错，而非静默成功', () => {
    // 静默成功会让用户以为「改了但没生效」，是最难排查的一类问题
    expect(hasMobileConfigHandlers()).toBe(false)
    const r = applyMobileConfig('model', 'sonnet')
    expect(r.ok).toBe(false)
    expect(r.error).toBeTruthy()
  })

  it('校验失败时不触碰回调', () => {
    const setModel = vi.fn()
    setMobileConfigHandlers({
      setModel,
      setThinkingTokens: vi.fn(),
      setPermissionMode: vi.fn(() => ({ ok: true as const })),
      setVerbose: vi.fn(),
    })
    applyMobileConfig('model', '非法 名字')
    expect(setModel, '校验未过不应调用回调').not.toHaveBeenCalled()
  })

  it('bypassPermissions 在到达回调前就被拦截', () => {
    const setPermissionMode = vi.fn(() => ({ ok: true as const }))
    setMobileConfigHandlers({
      setModel: vi.fn(),
      setThinkingTokens: vi.fn(),
      setPermissionMode,
      setVerbose: vi.fn(),
    })
    const r = applyMobileConfig('permissionMode', 'bypassPermissions')
    expect(r.ok).toBe(false)
    expect(
      setPermissionMode,
      'bypassPermissions 必须在白名单层就被挡住，绝不能到达回调',
    ).not.toHaveBeenCalled()
  })
})

describe('applyMobileConfig — 正常路径', () => {
  it('合法模型名调用 setModel', () => {
    const setModel = vi.fn()
    setMobileConfigHandlers({
      setModel,
      setThinkingTokens: vi.fn(),
      setPermissionMode: vi.fn(() => ({ ok: true as const })),
      setVerbose: vi.fn(),
    })
    expect(applyMobileConfig('model', 'claude-sonnet-4-6').ok).toBe(true)
    expect(setModel).toHaveBeenCalledWith('claude-sonnet-4-6')
  })

  it('default 映射为 null（恢复默认）', () => {
    const setModel = vi.fn()
    setMobileConfigHandlers({
      setModel,
      setThinkingTokens: vi.fn(),
      setPermissionMode: vi.fn(() => ({ ok: true as const })),
      setVerbose: vi.fn(),
    })
    applyMobileConfig('model', 'default')
    expect(setModel).toHaveBeenCalledWith(null)
  })

  it('合法权限模式调用回调并透传其结果', () => {
    const setPermissionMode = vi.fn(() => ({ ok: false as const, error: '上游拒绝' }))
    setMobileConfigHandlers({
      setModel: vi.fn(),
      setThinkingTokens: vi.fn(),
      setPermissionMode,
      setVerbose: vi.fn(),
    })
    const r = applyMobileConfig('permissionMode', 'plan')
    expect(setPermissionMode).toHaveBeenCalledWith('plan')
    expect(r.ok).toBe(false)
    expect(r.error).toBe('上游拒绝')
  })

  it('回调抛异常转成可读错误而非崩 WS', () => {
    setMobileConfigHandlers({
      setModel: () => {
        throw new Error('settings 文件只读')
      },
      setThinkingTokens: vi.fn(),
      setPermissionMode: vi.fn(() => ({ ok: true as const })),
      setVerbose: vi.fn(),
    })
    const r = applyMobileConfig('model', 'sonnet')
    expect(r.ok).toBe(false)
    expect(r.error).toContain('settings 文件只读')
  })

  it('注销回调后恢复「未注册」行为', () => {
    setMobileConfigHandlers({
      setModel: vi.fn(),
      setThinkingTokens: vi.fn(),
      setPermissionMode: vi.fn(() => ({ ok: true as const })),
      setVerbose: vi.fn(),
    })
    expect(hasMobileConfigHandlers()).toBe(true)
    setMobileConfigHandlers(null)
    expect(hasMobileConfigHandlers()).toBe(false)
    expect(applyMobileConfig('model', 'sonnet').ok).toBe(false)
  })
})

describe('verbose 布尔项', () => {
  it('接受 true / false', () => {
    expect(validateMobileConfig('verbose', true).ok).toBe(true)
    expect(validateMobileConfig('verbose', false).ok).toBe(true)
  })

  it('拒绝字符串与数字（类型必须严格）', () => {
    // 手机端与本地终端走同一条 WS，类型宽松会让「收到什么就信什么」。
    // 这类类型异常通常意味着调用方写错了，显式拒绝以便暴露问题。
    expect(validateMobileConfig('verbose', 'true').ok).toBe(false)
    expect(validateMobileConfig('verbose', 1).ok).toBe(false)
    expect(validateMobileConfig('verbose', null).ok).toBe(false)
  })

  it('合法值调用回调', () => {
    const setVerbose = vi.fn()
    setMobileConfigHandlers({
      setModel: vi.fn(),
      setThinkingTokens: vi.fn(),
      setPermissionMode: vi.fn(() => ({ ok: true as const })),
      setVerbose,
    })
    const r = applyMobileConfig('verbose', true)
    expect(r.ok).toBe(true)
    expect(setVerbose).toHaveBeenCalledWith(true)
  })

  it('非法值不调用回调', () => {
    const setVerbose = vi.fn()
    setMobileConfigHandlers({
      setModel: vi.fn(),
      setThinkingTokens: vi.fn(),
      setPermissionMode: vi.fn(() => ({ ok: true as const })),
      setVerbose,
    })
    applyMobileConfig('verbose', 'yes')
    expect(setVerbose).not.toHaveBeenCalled()
  })

  it('verbose 不受权限模式白名单影响（不涉及权限）', () => {
    // 回归：verbose 是纯显示开关，不该被任何权限相关的判据拦下
    // （若将来有人在校验里加「涉及权限的项都要二次确认」，这条会失败
    //  并提示重新评估 —— 但 verbose 确实不涉及权限）
    expect(validateMobileConfig('verbose', true).ok).toBe(true)
    expect(validateMobileConfig('permissionMode', 'bypassPermissions').ok).toBe(false)
  })
})
