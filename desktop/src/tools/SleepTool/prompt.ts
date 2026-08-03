import { TICK_TAG } from '../../constants/xml.js'

export const SLEEP_TOOL_NAME = 'Sleep'

export const DESCRIPTION = '等待指定时长'

export const SLEEP_TOOL_PROMPT = `等待指定的时长。用户可随时中断休眠。

当用户让你休眠或休息、你无事可做，或你在等待某事时，使用此工具。

你可能会收到 <${TICK_TAG}> 提示——这些是定期的检查点。在休眠前先看看是否有有用的工作可做。

你可以与其他工具并发调用此工具——它不会干扰其他工具的执行。

优先使用此工具而非 \`Bash(sleep ...)\`——它不会占用 shell 进程。

每次唤醒都会产生一次 API 调用，但提示缓存在闲置 5 分钟后会过期——请相应权衡。`