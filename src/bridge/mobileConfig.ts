/**
 * mobileConfig.ts — 手机端可远程修改的配置项白名单与校验
 *
 * 为什么需要单独一个白名单层：手机端是**网络可达**的控制面，
 * 与本地终端的安全前提不同。终端前的用户能看到的对话框、能按的键，
 * 不该默认全部开放给一个可能落在别人手里的浏览器/App。
 *
 * 三条设计原则：
 *
 * 1. **白名单而非黑名单**。未登记的一律拒绝 —— 黑名单会随 CLI 增加
 *    新命令而漏掉新增的危险项；白名单在新增时默认安全。
 *
 * 2. **绝不暴露 Bypass 权限模式**。本地 CLI 常以
 *    --dangerously-skip-permissions 运行（见 mobile.bat），而
 *    useReplBridge 的 onSetPermissionMode 实现**允许**切到
 *    bypassPermissions（只检查是否被显式禁用）。
 *    若原样透传，等于把「跳过全部权限」这个已被显式标记 dangerous 的
 *    开关放到网络可达的界面上 —— 拿到手机即可关掉本机防护。
 *    Claude 官方移动端同样不开放此项，此处照做。
 *
 * 3. **值是枚举而非自由字符串**。模型名、思考强度、权限模式都是有限集合，
 *    自由字符串会变成注入面（如传个不存在的模式导致上游异常）。
 */

/**
 * 手机端可改的配置项。
 *
 * 新增项时的取舍标准（三条都要满足）：
 * 1. **即改即生效**，不需要重启 CLI 或重开会话 —— 远程改配置的价值
 *    就在于「不必回电脑」，若改完还要回去重启，功能就没意义
 * 2. **值域封闭**（枚举或布尔）—— 自由字符串会变成注入面
 * 3. **不降低安全性** —— 不涉及权限、不写入持久配置
 *
 * 刻意**未收录**的候选及理由（避免后来者重复评估）：
 * · `outputStyle`：类型是自由字符串（`type OutputStyle = string`，
 *   含插件自定义风格），无法做值域白名单 —— 违反第 2 条
 * · `fastMode`：需写用户设置文件（`updateSettingsForSource`）且有
 *   冷却/计费逻辑，属「改配置」而非「改会话状态」—— 违反第 1、3 条
 */
export type MobileConfigKey =
  | 'model'
  | 'thinkingTokens'
  | 'permissionMode'
  /** 详细模式：显示更多过程细节（不涉及权限，可安全远程改）。 */
  | 'verbose'

/** 权限模式白名单。刻意不含 bypassPermissions —— 见文件头说明。 */
export const MOBILE_ALLOWED_PERMISSION_MODES = [
  'default',
  'plan',
  'acceptEdits',
  'auto',
] as const

export type MobilePermissionMode = (typeof MOBILE_ALLOWED_PERMISSION_MODES)[number]

/** 思考强度（token 预算）白名单。0 表示关闭思考。 */
export const MOBILE_ALLOWED_THINKING_TOKENS = [0, 1024, 4096, 16384, 32768] as const

/**
 * 模型名的宽松校验。
 *
 * 不做严格枚举：模型名随供应商与版本变化（claude-sonnet-4-6、
 * 各种兼容 API 的自定义名），硬编码枚举会让用户无法选新模型。
 * 改为「形状校验」：只允许别名或常见的模型标识字符集，
 * 且限长 —— 足以挡住注入，又不会误伤合法模型名。
 */
const MODEL_NAME_PATTERN = /^[A-Za-z0-9._:-]{1,80}$/

export interface ConfigValidation {
  ok: boolean
  /** 校验失败的原因（面向用户，需可读）。 */
  error?: string
}

/**
 * 校验一次配置变更请求。
 *
 * 纯函数、无副作用，便于单测穷举边界 —— 这是安全边界，必须逐个值钉住。
 */
export function validateMobileConfig(key: unknown, value: unknown): ConfigValidation {
  if (typeof key !== 'string') {
    return { ok: false, error: '配置项名称必须是字符串' }
  }

  switch (key) {
    case 'model': {
      if (value === null || value === 'default') {
        // null / 'default' 表示恢复默认，是合法操作
        return { ok: true }
      }
      if (typeof value !== 'string') {
        return { ok: false, error: '模型名必须是字符串或 null' }
      }
      if (!MODEL_NAME_PATTERN.test(value)) {
        return { ok: false, error: '模型名含非法字符或过长' }
      }
      return { ok: true }
    }

    case 'thinkingTokens': {
      if (typeof value !== 'number' || !Number.isInteger(value)) {
        return { ok: false, error: '思考强度必须是整数' }
      }
      if (!(MOBILE_ALLOWED_THINKING_TOKENS as readonly number[]).includes(value)) {
        return {
          ok: false,
          error: `思考强度只允许 ${MOBILE_ALLOWED_THINKING_TOKENS.join(' / ')}`,
        }
      }
      return { ok: true }
    }

    case 'permissionMode': {
      if (typeof value !== 'string') {
        return { ok: false, error: '权限模式必须是字符串' }
      }
      // 显式挡住 bypass —— 这是本文件存在的主要理由，错误信息要说明原因，
      // 否则用户会以为是 bug 而不是有意的安全限制
      if (value === 'bypassPermissions') {
        return {
          ok: false,
          error: '出于安全考虑，手机端不允许切换到「跳过权限」模式，请在电脑终端操作',
        }
      }
      if (!(MOBILE_ALLOWED_PERMISSION_MODES as readonly string[]).includes(value)) {
        return {
          ok: false,
          error: `权限模式只允许 ${MOBILE_ALLOWED_PERMISSION_MODES.join(' / ')}`,
        }
      }
      return { ok: true }
    }

    case 'verbose': {
      // 布尔项：只接受真正的 boolean。
      // 不接受字符串 "true"/数字 1 —— 手机端与本地终端走同一条 WS，
      // 类型宽松会让「服务端收到什么就信什么」，而这类配置的
      // 类型异常往往意味着调用方写错了，应显式拒绝以便暴露问题。
      if (typeof value !== 'boolean') {
        return { ok: false, error: '详细模式必须是 true 或 false' }
      }
      return { ok: true }
    }

    default:
      return { ok: false, error: `不支持的配置项：${key}` }
  }
}
