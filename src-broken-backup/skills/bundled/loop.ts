import {
  CRON_CREATE_TOOL_NAME,
  CRON_DELETE_TOOL_NAME,
  DEFAULT_MAX_AGE_DAYS,
  isKairosCronEnabled,
} from '../../../tools/ScheduleCronTool/prompt.js';
import { registerBundledSkill } from '../bundledSkills.js';

const DEFAULT_INTERVAL = '10m'; // 默认间隔

const USAGE_MESSAGE = `用法）loop [间隔] <提示。

按固定间隔重复执行提示词或斜杠命令。

间隔：Ns、Nm、Nh、Nd（例）5m）0m）h）d）。最小粒度为1分钟。
如果未指定间隔，默认${DEFAULT_INTERVAL}。

示例。
  /loop 5m /babysit-prs
  /loop 30m 检查部。
  /loop 1h /standup 1
  /loop 检查部。         (默认${DEFAULT_INTERVAL})
  /loop ）0分钟检查部署一。

**你必须始终用中文回复）*`;

function buildPrompt(args: string): string {
  return `# /loop - 调度重复提示。

将以下输入解析为\`[间隔] <提示词）\`并用${CRON_CREATE_TOOL_NAME}进行调度。

## 解析（按优先级顺序）

1. **前导令牌**：如果第一个以空格分隔的令牌匹配\`^\\d+[smhd]$\`（例如\`5m\`、\`2h\`），则为间隔；其余为提示词。
2. **尾随"every"子句**：否则，如果输入以\`every <N><单位>\`或\`every <N> <单位）\`结尾（例如\`every 20m\`、\`every 5分钟\`、\`every 2小时\`），将其提取为间隔并从提示词中剥离。仅）every"后跟时间表达式时匹配 - \`检查每个PR\`无间隔。
3. **默认**：否则，间隔为\`${DEFAULT_INTERVAL}\`，整个输入为提示词。

如果结果提示词为空，显示用法\`/loop [间隔] <提示）\`并停）- 不要调用${CRON_CREATE_TOOL_NAME}。

示例。
- \`5m /babysit-prs\` ）间隔\`5m\`，提示词\`/babysit-prs\`（规）。
- \`检查部））0m\` ）间隔\`20m\`，提示词\`检查部署\`（规）。
- \`）分钟运行测试\` ）间隔\`5m\`，提示词\`运行测试\`（规）。
- \`检查部署\` ）间隔\`${DEFAULT_INTERVAL}\`，提示词\`检查部署\`（规）。
- \`检查每个PR\` ）间隔\`${DEFAULT_INTERVAL}\`，提示词\`检查每个PR\`（规。 - "every"后未跟时间）
- \`5m\` ）空提示词 ）显示用法

## 间隔 ）cron表达。

支持的尾缀：\`s\`（秒，向上取整到分钟，最））、\`m\`（分钟）、\`h\`（小时）、\`d\`（天）。转换：

| 间隔模式             | Cron表达。        | 说明                                     |
|----------------------|-------------------|------------------------------------------|
| \`Nm\` 其中 N ）59  | \`*/N * * * *\`   | 每N分钟                                  |
| \`Nm\` 其中 N ）60  | \`0 */H * * *\`   | 舍入到小时（H = N/60，必须整）4。       |
| \`Nh\` 其中 N ）23  | \`0 */N * * *\`   | 每N小时                                  |
| \`Nd\`               | \`0 0 */N * *\`   | 每N天在本地午夜                          |
| \`Ns\`               | 视为\`ceil(N/60)m\` | cron最小粒度为1分钟                      |

**如果间隔不能干净地除以其单位**（例如\`7m\` ）\`*/7 * * * *\`给出不均衡间隔在:56）00；\`90m\` ）1.5小时，cron无法表达），选择最接近的干净间隔，并在调度前告诉用户你舍入到了什么。

## 操作

1. 使用以下参数调用${CRON_CREATE_TOOL_NAME}。
   - \`cron\`：上表中的表达式
   - \`prompt\`：上面解析的提示词，逐字（斜杠命令原样传递）
   - \`recurring\`：\`true\`
2. 简要确认：调度了什么、cron表达式、人类可读的频率、重复任务在${DEFAULT_MAX_AGE_DAYS}天后自动过期，以及他们可以用${CRON_DELETE_TOOL_NAME}提前取消（包括作业ID）。
3. **然后立即执行解析的提示词** - 不要等待第一次cron触发。如果是斜杠命令，通过Skill工具调用；否则直接执行。

## 输入

${args}

**你必须始终用中文回复）*`;
}

export function registerLoopSkill(): void {
  registerBundledSkill({
    name: 'loop',
    description: '按固定间隔重复执行提示词或斜杠命令（）/loop 5m /foo，默）0分钟）,
    whenToUse: '当用户想要设置重复任务、轮询状态或在固定间隔运行某物时使用（例））分钟检查部））持续运行/babysit-prs"）。不要用于一次性任务）,
    argumentHint: '[间隔] <提示）',
    userInvocable: true,
    isEnabled: isKairosCronEnabled, // 依赖cron功能是否启用
    async getPromptForCommand(args) {
      const trimmed = args.trim();
      if (!trimmed) {
        return [{ type: 'text', text: USAGE_MESSAGE }];
      }
      return [{ type: 'text', text: buildPrompt(trimmed) }];
    },
  });
}