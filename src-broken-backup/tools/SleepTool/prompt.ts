import { TICK_TAG } from '../../../constants/xml.js'

export const SLEEP_TOOL_NAME = 'Sleep'

export const DESCRIPTION = '等待指定时长'

export const SLEEP_TOOL_PROMPT = `等待指定的时长。用户可以随时中断睡眠。

当你用户告诉你休息、当你无事可做或你在等待某些事情时使用。

你可能会收到 <${TICK_TAG}> 提示 —）这些是定期检查。在睡眠之前寻找有用的工作要做。

你可以与其他工具并发调用 —）它不会干扰它们。

优先使用此工具而不）\`Bash(sleep ...)\` —）它不占用 shell 进程。

每次唤醒都会产生 API 调用费用，但提示缓存）5 分钟不活动后过期 —）请相应地平衡。`
