// biome-ignore-all assist/source/organizeImports: ANT-ONLY �����ǲ�����������
import addDir from './commands/add-dir/index.js'
import addModel from './commands/add-model/index.js'
import removeModel from './commands/remove-model/index.js'
import autofixPr from './commands/autofix-pr/index.js'
import backfillSessions from './commands/backfill-sessions/index.js'
import btw from './commands/btw/index.js'
import goodClaude from './commands/good-claude/index.js'
import issue from './commands/issue/index.js'
import feedback from './commands/feedback/index.js'
import fuck from './commands/fuck/index.js'
import clear from './commands/clear/index.js'
import color from './commands/color/index.js'
import commit from './commands/commit.js'
import copy from './commands/copy/index.js'
import desktop from './commands/desktop/index.js'
import commitPushPr from './commands/commit-push-pr.js'
import compact from './commands/compact/index.js'
import config from './commands/config/index.js'
import { context, contextNonInteractive } from './commands/context/index.js'
import cost from './commands/cost/index.js'
import diff from './commands/diff/index.js'
import ctx_viz from './commands/ctx_viz/index.js'
import doctor from './commands/doctor/index.js'
import memory from './commands/memory/index.js'
import help from './commands/help/index.js'
import ide from './commands/ide/index.js'
import init from './commands/init.js'
import initVerifiers from './commands/init-verifiers.js'
import keybindings from './commands/keybindings/index.js'
import login from './commands/login/index.js'
import logout from './commands/logout/index.js'
import installGitHubApp from './commands/install-github-app/index.js'
import installSlackApp from './commands/install-slack-app/index.js'
import breakCache from './commands/break-cache/index.js'
import mcp from './commands/mcp/index.js'
import mobile from './commands/mobile/index.js'
import onboarding from './commands/onboarding/index.js'
import pr_comments from './commands/pr_comments/index.js'
import releaseNotes from './commands/release-notes/index.js'
import rename from './commands/rename/index.js'
import resume from './commands/resume/index.js'
import review, { ultrareview } from './commands/review.js'
import session from './commands/session/index.js'
import share from './commands/share/index.js'
import skills from './commands/skills/index.js'
import status from './commands/status/index.js'
import tasks from './commands/tasks/index.js'
import teleport from './commands/teleport/index.js'
 
const agentsPlatform =
  process.env.USER_TYPE === 'ant'
    ? require('./commands/agents-platform/index.js').default
    : null
 
import securityReview from './commands/security-review.js'
import bughunter from './commands/bughunter/index.js'
import terminalSetup from './commands/terminalSetup/index.js'
import usage from './commands/usage/index.js'
import theme from './commands/theme/index.js'
import vim from './commands/vim/index.js'
import { feature } from 'bun:bundle'
// ��������������������
 
const proactive =
  feature('PROACTIVE') || feature('KAIROS')
    ? require('./commands/proactive.js').default
    : null
const briefCommand =
  feature('KAIROS') || feature('KAIROS_BRIEF')
    ? require('./commands/brief.js').default
    : null
const assistantCommand = feature('KAIROS')
  ? require('./commands/assistant/index.js').default
  : null
const bridge = feature('BRIDGE_MODE')
  ? require('./commands/bridge/index.js').default
  : null
const remoteControlServerCommand =
  feature('DAEMON') && feature('BRIDGE_MODE')
    ? require('./commands/remoteControlServer/index.js').default
    : null
const voiceCommand = feature('VOICE_MODE')
  ? require('./commands/voice/index.js').default
  : null
const forceSnip = feature('HISTORY_SNIP')
  ? require('./commands/force-snip.js').default
  : null
const workflowsCmd = feature('WORKFLOW_SCRIPTS')
  ? (
      require('./commands/workflows/index.js') as typeof import('./commands/workflows/index.js')
    ).default
  : null
const webCmd = feature('CCR_REMOTE_SETUP')
  ? (
      require('./commands/remote-setup/index.js') as typeof import('./commands/remote-setup/index.js')
    ).default
  : null
const clearSkillIndexCache = feature('EXPERIMENTAL_SKILL_SEARCH')
  ? (
      require('./services/skillSearch/localSearch.js') as typeof import('./services/skillSearch/localSearch.js')
    ).clearSkillIndexCache
  : null
const subscribePr = feature('KAIROS_GITHUB_WEBHOOKS')
  ? require('./commands/subscribe-pr.js').default
  : null
const ultraplan = feature('ULTRAPLAN')
  ? require('./commands/ultraplan.js').default
  : null
const torch = feature('TORCH') ? require('./commands/torch.js').default : null
const peersCmd = feature('UDS_INBOX')
  ? (
      require('./commands/peers/index.js') as typeof import('./commands/peers/index.js')
    ).default
  : null
const forkCmd = feature('FORK_SUBAGENT')
  ? (
      require('./commands/fork/index.js') as typeof import('./commands/fork/index.js')
    ).default
  : null
const buddy = feature('BUDDY')
  ? (
      require('./commands/buddy/index.js') as typeof import('./commands/buddy/index.js')
    ).default
  : null
 
import thinkback from './commands/thinkback/index.js'
import thinkbackPlay from './commands/thinkback-play/index.js'
import permissions from './commands/permissions/index.js'
import plan from './commands/plan/index.js'
import fast from './commands/fast/index.js'
import passes from './commands/passes/index.js'
import privacySettings from './commands/privacy-settings/index.js'
import hooks from './commands/hooks/index.js'
import files from './commands/files/index.js'
import branch from './commands/branch/index.js'
import agents from './commands/agents/index.js'
import plugin from './commands/plugin/index.js'
import reloadPlugins from './commands/reload-plugins/index.js'
import rewind from './commands/rewind/index.js'
import heapDump from './commands/heapdump/index.js'
import mockLimits from './commands/mock-limits/index.js'
import bridgeKick from './commands/bridge-kick.js'
import version from './commands/version.js'
import summary from './commands/summary/index.js'
import {
  resetLimits,
  resetLimitsNonInteractive,
} from './commands/reset-limits/index.js'
import antTrace from './commands/ant-trace/index.js'
import perfIssue from './commands/perf-issue/index.js'
import sandboxToggle from './commands/sandbox-toggle/index.js'
import chrome from './commands/chrome/index.js'
import stickers from './commands/stickers/index.js'
import advisor from './commands/advisor.js'
import { logError } from './utils/log.js'
import { toError } from './utils/errors.js'
import { logForDebugging } from './utils/debug.js'
import {
  getSkillDirCommands,
  clearSkillCaches,
  getDynamicSkills,
} from './skills/loadSkillsDir.js'
import { getBundledSkills } from './skills/bundledSkills.js'
import { getBuiltinPluginSkillCommands } from './plugins/builtinPlugins.js'
import {
  getPluginCommands,
  clearPluginCommandCache,
  getPluginSkills,
  clearPluginSkillsCache,
} from './utils/plugins/loadPluginCommands.js'
import memoize from 'lodash-es/memoize.js'
import { isUsing3PServices, isClaudeAISubscriber } from './utils/auth.js'
import { isFirstPartyAnthropicBaseUrl } from './utils/model/providers.js'
import env from './commands/env/index.js'
import exit from './commands/exit/index.js'
import exportCommand from './commands/export/index.js'
import model from './commands/model/index.js'
import tag from './commands/tag/index.js'
import outputStyle from './commands/output-style/index.js'
import remoteEnv from './commands/remote-env/index.js'
import upgrade from './commands/upgrade/index.js'
import {
  extraUsage,
  extraUsageNonInteractive,
} from './commands/extra-usage/index.js'
import rateLimitOptions from './commands/rate-limit-options/index.js'
import statusline from './commands/statusline.js'
import effort from './commands/effort/index.js'
import stats from './commands/stats/index.js'
// insights.ts ��СΪ 113KB��3200 �У����� diffLines/html ��Ⱦ�����ӳ� shim �Ƴټ�����ģ�飬ֱ��ʵ�ʵ��� /insights ���
const usageReport: Command = {
  type: 'prompt',
  name: 'insights',
  description: '���ɷ������棬������� Claude Code �Ự',
  contentLength: 0,
  progressMessage: '���ڷ�����ĻỰ',
  source: 'builtin',
  async getPromptForCommand(args, context) {
    const real = (await import('./commands/insights.js')).default
    if (real.type !== 'prompt') throw new Error('���ɴ�')
    return real.getPromptForCommand(args, context)
  },
}
import oauthRefresh from './commands/oauth-refresh/index.js'
import debugToolCall from './commands/debug-tool-call/index.js'
import { getSettingSourceName } from './utils/settings/constants.js'
import {
  type Command,
  getCommandName,
  isCommandEnabled,
} from './types/command.js'

// �Ӽ���λ�����µ�������
export type {
  Command,
  CommandBase,
  CommandResultDisplay,
  LocalCommandResult,
  LocalJSXCommandContext,
  PromptCommand,
  ResumeEntrypoint,
} from './types/command.js'
export { getCommandName, isCommandEnabled } from './types/command.js'

// ���ⲿ�����б��ų�������
export const INTERNAL_ONLY_COMMANDS = [
  backfillSessions,
  breakCache,
  bughunter,
  commit,
  commitPushPr,
  ctx_viz,
  goodClaude,
  issue,
  initVerifiers,
  ...(forceSnip ? [forceSnip] : []),
  mockLimits,
  bridgeKick,
  version,
  ...(ultraplan ? [ultraplan] : []),
  ...(subscribePr ? [subscribePr] : []),
  resetLimits,
  resetLimitsNonInteractive,
  onboarding,
  share,
  summary,
  teleport,
  antTrace,
  perfIssue,
  env,
  oauthRefresh,
  debugToolCall,
  agentsPlatform,
  autofixPr,
].filter(Boolean)

// ����Ϊ�������Ա��ڵ��� getCommands ֮ǰ�����д˺�����
// ��Ϊ�ײ㺯�����ȡ���ã���������ģ���ʼ��ʱ�޷���ȡ��
const COMMANDS = memoize((): Command[] => [
  addDir,
  addModel,
  removeModel,
  advisor,
  agents,
  branch,
  btw,
  chrome,
  clear,
  color,
  compact,
  config,
  copy,
  desktop,
  context,
  contextNonInteractive,
  cost,
  diff,
  doctor,
  effort,
  exit,
  fast,
  files,
  heapDump,
  help,
  ide,
  init,
  keybindings,
  installGitHubApp,
  installSlackApp,
  mcp,
  memory,
  mobile,
  model,
  outputStyle,
  remoteEnv,
  plugin,
  pr_comments,
  releaseNotes,
  reloadPlugins,
  rename,
  resume,
  session,
  skills,
  stats,
  status,
  statusline,
  stickers,
  tag,
  theme,
  feedback,
  fuck,
  review,
  ultrareview,
  rewind,
  securityReview,
  terminalSetup,
  upgrade,
  extraUsage,
  extraUsageNonInteractive,
  rateLimitOptions,
  usage,
  usageReport,
  vim,
  ...(webCmd ? [webCmd] : []),
  ...(forkCmd ? [forkCmd] : []),
  ...(buddy ? [buddy] : []),
  ...(proactive ? [proactive] : []),
  ...(briefCommand ? [briefCommand] : []),
  ...(assistantCommand ? [assistantCommand] : []),
  ...(bridge ? [bridge] : []),
  ...(remoteControlServerCommand ? [remoteControlServerCommand] : []),
  ...(voiceCommand ? [voiceCommand] : []),
  thinkback,
  thinkbackPlay,
  permissions,
  plan,
  privacySettings,
  hooks,
  exportCommand,
  sandboxToggle,
  ...(!isUsing3PServices() ? [logout, login()] : []),
  passes,
  ...(peersCmd ? [peersCmd] : []),
  tasks,
  ...(workflowsCmd ? [workflowsCmd] : []),
  ...(torch ? [torch] : []),
  ...(process.env.USER_TYPE === 'ant' && !process.env.IS_DEMO
    ? INTERNAL_ONLY_COMMANDS
    : []),
])

export const builtInCommandNames = memoize(
  (): Set<string> =>
    new Set(COMMANDS().flatMap(_ => [_.name, ...(_.aliases ?? [])])),
)

async function getSkills(cwd: string): Promise<{
  skillDirCommands: Command[]
  pluginSkills: Command[]
  bundledSkills: Command[]
  builtinPluginSkills: Command[]
}> {
  try {
    const [skillDirCommands, pluginSkills] = await Promise.all([
      getSkillDirCommands(cwd).catch(err => {
        logError(toError(err))
        logForDebugging('����Ŀ¼�������ʧ�ܣ�������������������')
        return []
      }),
      getPluginSkills().catch(err => {
        logError(toError(err))
        logForDebugging('������ܼ���ʧ�ܣ�������������������')
        return []
      }),
    ])
    // �������������ʱͬ��ע��
    const bundledSkills = getBundledSkills()
    // ���ò���������������õ����ò��
    const builtinPluginSkills = getBuiltinPluginSkillCommands()
    logForDebugging(
      `getSkills ����: ${skillDirCommands.length} ������Ŀ¼����, ${pluginSkills.length} ���������, ${bundledSkills.length} ���������, ${builtinPluginSkills.length} �����ò������`,
    )
    return {
      skillDirCommands,
      pluginSkills,
      bundledSkills,
      builtinPluginSkills,
    }
  } catch (err) {
    // ����Զ��Ӧ�÷�������Ϊ������ Promise ���沶���ˣ��������Դ���
    logError(toError(err))
    logForDebugging('getSkills �г���������󣬷��ؿս��')
    return {
      skillDirCommands: [],
      pluginSkills: [],
      bundledSkills: [],
      builtinPluginSkills: [],
    }
  }
}

 
const getWorkflowCommands = feature('WORKFLOW_SCRIPTS')
  ? (
      require('./tools/WorkflowTool/createWorkflowCommand.js') as typeof import('./tools/WorkflowTool/createWorkflowCommand.js')
    ).getWorkflowCommands
  : null
 

/**
 * �������������� `availability`��������֤/�ṩ��Ҫ�󣩹������
 * û�� `availability` �������Ϊͨ�����
 * �˹����� `isEnabled()` ֮ǰ���У�������ṩ�̿��Ƶ���������أ�
 * �������Ա�־״̬��Ρ�
 *
 * �����м��仯 ���� ��֤״̬�����ڻỰ�иı䣨����ִ�� /login �󣩣�
 * ���ÿ�ε��� getCommands() ʱ������������ֵ��
 */
export function meetsAvailabilityRequirement(cmd: Command): boolean {
  if (!cmd.availability) return true
  for (const a of cmd.availability) {
    switch (a) {
      case 'claude-ai':
        if (isClaudeAISubscriber()) return true
        break
      case 'console':
        // Console API ��Կ�û� = ֱ�� 1P API �ͻ������� 3P��Ҳ���� claude.ai����
        // �ų�ʹ�� 3P��Bedrock/Vertex/Foundry����δ���� ANTHROPIC_BASE_URL ���û���
        // �Լ�ͨ���Զ������ URL �����������û���
        if (
          !isClaudeAISubscriber() &&
          !isUsing3PServices() &&
          isFirstPartyAnthropicBaseUrl()
        )
          return true
        break
      default: {
        const _exhaustive: never = a
        void _exhaustive
        break
      }
    }
  }
  return false
}

/**
 * ������������Դ�����ܡ������������������ cwd ���м��仯��
 * ��Ϊ���ؿ����ϴ󣨴��� I/O����̬���룩��
 */
const loadAllCommands = memoize(async (cwd: string): Promise<Command[]> => {
  const [
    { skillDirCommands, pluginSkills, bundledSkills, builtinPluginSkills },
    pluginCommands,
    workflowCommands,
  ] = await Promise.all([
    getSkills(cwd),
    getPluginCommands(),
    getWorkflowCommands ? getWorkflowCommands(cwd) : Promise.resolve([]),
  ])

  return [
    ...bundledSkills,
    ...builtinPluginSkills,
    ...skillDirCommands,
    ...workflowCommands,
    ...pluginCommands,
    ...pluginSkills,
    ...COMMANDS(),
  ]
})

/**
 * ���ص�ǰ�û����õ������ʱ�ļ����Ѽ��仯��
 * �������Ժ� isEnabled ���ÿ�ε��ö����������У��Ա�
 * ������֤���ģ��� /login��������Ч��
 */
export async function getCommands(cwd: string): Promise<Command[]> {
  const allCommands = await loadAllCommands(cwd)

  // ��ȡ���ļ������ڼ䷢�ֵĶ�̬����
  const dynamicSkills = getDynamicSkills()

  // ������������̬���ܵĻ�������
  const baseCommands = allCommands.filter(
    _ => meetsAvailabilityRequirement(_) && isCommandEnabled(_),
  )

  if (dynamicSkills.length === 0) {
    return baseCommands
  }

  // ȥ�ض�̬���� ���� ������δ����ʱ������
  const baseCommandNames = new Set(baseCommands.map(c => c.name))
  const uniqueDynamicSkills = dynamicSkills.filter(
    s =>
      !baseCommandNames.has(s.name) &&
      meetsAvailabilityRequirement(s) &&
      isCommandEnabled(s),
  )

  if (uniqueDynamicSkills.length === 0) {
    return baseCommands
  }

  // �ڲ������֮����������֮ǰ���붯̬����
  const builtInNames = new Set(COMMANDS().map(c => c.name))
  const insertIndex = baseCommands.findIndex(c => builtInNames.has(c.name))

  if (insertIndex === -1) {
    return [...baseCommands, ...uniqueDynamicSkills]
  }

  return [
    ...baseCommands.slice(0, insertIndex),
    ...uniqueDynamicSkills,
    ...baseCommands.slice(insertIndex),
  ]
}

/**
 * ���������ļ��仯���棬���������ܻ��档
 * �����Ӷ�̬������ʹ����������б�ʧЧʱʹ�ô˺�����
 */
export function clearCommandMemoizationCaches(): void {
  loadAllCommands.cache?.clear?.()
  getSkillToolCommands.cache?.clear?.()
  getSlashCommandToolSkills.cache?.clear?.()
  // skillSearch/localSearch.ts �е� getSkillIndex ��һ�������ļ��仯�㣬
  // ������ getSkillToolCommands/getCommands ֮�ϡ�������ڲ�����
  // �������Ӱ�� ���� lodash memoize �᷵�ػ���������Զ���ᵽ����������ڲ���
  // ������ʽ�������
  clearSkillIndexCache?.()
}

export function clearCommandsCache(): void {
  clearCommandMemoizationCaches()
  clearPluginCommandCache()
  clearPluginSkillsCache()
  clearSkillCaches()
}

/**
 * �� AppState.mcp.commands ����Ϊ MCP �ṩ�ļ��ܣ�prompt ���͡�
 * ģ�Ϳɵ��á��� MCP ���أ�����Щ����λ�� getCommands() ֮�⣬
 * �����Ҫ�ڼ��������е������� MCP ���ܵĵ��÷�����ͨ���˺�����ȡ��
 */
export function getMcpSkillCommands(
  mcpCommands: readonly Command[],
): readonly Command[] {
  if (feature('MCP_SKILLS')) {
    return mcpCommands.filter(
      cmd =>
        cmd.type === 'prompt' &&
        cmd.loadedFrom === 'mcp' &&
        !cmd.disableModelInvocation,
    )
  }
  return []
}

// SkillTool ��ʾ����ģ�Ϳɵ��õĻ�����ʾ������
// ��������ܣ����� /skills/����������� /commands/��
export const getSkillToolCommands = memoize(
  async (cwd: string): Promise<Command[]> => {
    const allCommands = await getCommands(cwd)
    return allCommands.filter(
      cmd =>
        cmd.type === 'prompt' &&
        !cmd.disableModelInvocation &&
        cmd.source !== 'builtin' &&
        // ʼ�հ������� /skills/ Ŀ¼����������Լ��ɰ� /commands/ ��Ŀ�ļ���
        // �����ȱ�� frontmatter�����Ƕ���ӵ�һ���Զ�������������
        // ���/MCP ��������Ҫ��ʽ�������ܳ������б��С�
        (cmd.loadedFrom === 'bundled' ||
          cmd.loadedFrom === 'skills' ||
          cmd.loadedFrom === 'commands_DEPRECATED' ||
          cmd.hasUserSpecifiedDescription ||
          cmd.whenToUse),
    )
  },
)

// ����������������ܡ�������Ϊģ���ṩר�����������
// ͨ�� loadedFrom Ϊ 'skills'��'plugin' �� 'bundled'���������� disableModelInvocation ����ʶ��
export const getSlashCommandToolSkills = memoize(
  async (cwd: string): Promise<Command[]> => {
    try {
      const allCommands = await getCommands(cwd)
      return allCommands.filter(
        cmd =>
          cmd.type === 'prompt' &&
          cmd.source !== 'builtin' &&
          (cmd.hasUserSpecifiedDescription || cmd.whenToUse) &&
          (cmd.loadedFrom === 'skills' ||
            cmd.loadedFrom === 'plugin' ||
            cmd.loadedFrom === 'bundled' ||
            cmd.disableModelInvocation),
      )
    } catch (error) {
      logError(toError(error))
      // ���ؿ�����������׳��쳣 ���� �����Ƿǹؼ���
      // ����Է�ֹ���ܼ���ʧ���ƻ�����ϵͳ
      logForDebugging('���ڼ���ʧ�ܣ����ؿռ�������')
      return []
    }
  },
)

/**
 * ����Զ��ģʽ��--remote���°�ȫʹ�õ����
 * ��Щ�����Ӱ�챾�� TUI ״̬�������������ļ�ϵͳ��
 * git��shell��IDE��MCP ����������ִ�������ġ�
 *
 * ���������ط���
 * 1. �� main.tsx ��Ⱦ REPL ֮ǰԤ���������ֹ�� CCR ��ʼ��������
 * 2. �� CCR ���˺��� REPL �� handleRemoteInit �б������ޱ��ص�����
 */
export const REMOTE_SAFE_COMMANDS: Set<Command> = new Set([
  session, // ��ʾԶ�̻Ự�Ķ�ά��/URL
  exit, // �˳� TUI
  clear, // ����
  help, // ��ʾ����
  theme, // �����ն�����
  color, // ���� agent ��ɫ
  vim, // �л� vim ģʽ
  cost, // ��ʾ�Ự�ɱ������سɱ����٣�
  usage, // ��ʾʹ����Ϣ
  copy, // �������һ����Ϣ
  btw, // ���ٱ�ע
  feedback, // ���ͷ���
  plan, // �ƻ�ģʽ�л�
  keybindings, // ��ݼ�����
  statusline, // ״̬���л�
  stickers, // ��ֽ
  mobile, // �ƶ��˶�ά��
])

/**
 * ����Ϊ 'local' �����������ͨ��Զ�̿����Žӣ��ƶ���/Web �ͻ��ˣ�����ʱ�����԰�ȫִ�С�
 * ��Щ���������ı��������ʽ���ظ��ƶ���/Web �ͻ��ˣ�����û�н����ն˵ĸ����á�
 *
 * ����Ϊ 'local-jsx' �������ֹ�����ǻ���Ⱦ Ink UI����
 * ����Ϊ 'prompt' ��������������ǻ�չ��Ϊ���͸�ģ�͵��ı�������
 * �˼��Ͻ����� 'local' ���
 *
 * �����µ� 'local' ���ϣ�������ƶ��˹���ʱ�����ڴ˴����ӡ�Ĭ����Ϊ�Ǳ���ֹ��
 */
export const BRIDGE_SAFE_COMMANDS: Set<Command> = new Set(
  [
    compact, // ѹ�������� ���� ���ֻ��ϻỰ���ں�����
    clear, // ��նԻ���¼
    cost, // ��ʾ�Ự�ɱ�
    summary, // �ܽ�Ի�
    releaseNotes, // ��ʾ������־
    files, // �г����ٵ��ļ�
  ].filter((c): c is Command => c !== null),
)

/**
 * �ж�һ��б��������������ͨ��Զ�̿����Žӣ��ƶ���/Web �ͻ��ˣ�����ʱ�Ƿ�ȫִ�С�
 *
  * PR #19134 ��ȫ����ֹ����ͨ���Ž���վ��б�������Ϊ iOS �ϵ� `/model` �ᵯ�����ص� Ink ѡ������
 * ��ν��ͨ����ʽ�������ſ������ƣ�'prompt' ������ܣ���չ��Ϊ�ı����ӽṹ�Ͼ��ǰ�ȫ�ģ�
 * 'local' ������Ҫͨ�� BRIDGE_SAFE_COMMANDS ��ʽѡ����룻'local-jsx' ������Ⱦ Ink UI�����ֱ���ֹ��
 */
export function isBridgeSafeCommand(cmd: Command): boolean {
  if (cmd.type === 'local-jsx') return false
  if (cmd.type === 'prompt') return true
  return BRIDGE_SAFE_COMMANDS.has(cmd)
}

/**
 * �������������Զ��ģʽ�°�ȫ�����
 * ������ --remote ģʽ����Ⱦ REPL ʱԤ�������
 * ��ֹ���ޱ��ص������� CCR ��ʼ����Ϣ����֮ǰ���ݿ��á�
 */
export function filterCommandsForRemoteMode(commands: Command[]): Command[] {
  return commands.filter(cmd => REMOTE_SAFE_COMMANDS.has(cmd))
}

export function findCommand(
  commandName: string,
  commands: Command[],
): Command | undefined {
  return commands.find(
    _ =>
      _.name === commandName ||
      getCommandName(_) === commandName ||
      _.aliases?.includes(commandName),
  )
}

export function hasCommand(commandName: string, commands: Command[]): boolean {
  return findCommand(commandName, commands) !== undefined
}

export function getCommand(commandName: string, commands: Command[]): Command {
  const command = findCommand(commandName, commands)
  if (!command) {
    throw ReferenceError(
      `δ�ҵ����� ${commandName}���������${commands
        .map(_ => {
          const name = getCommandName(_)
          return _.aliases ? `${name} (����: ${_.aliases.join(', ')})` : name
        })
        .sort((a, b) => a.localeCompare(b))
        .join(', ')}`,
    )
  }

  return command
}

/**
 * ��ʽ�������������������Դע�ͣ����������û��Ľ��档
 * ��������ʾ��������Ļ�Լ�������Ҫ���û���ʾ������Դ�ĵط�ʹ�á�
 *
 * ��������ģ�͵���ʾ���� SkillTool����ֱ��ʹ�� cmd.description ���ɡ�
 */
export function formatDescriptionWithSource(cmd: Command): string {
  if (cmd.type !== 'prompt') {
    return cmd.description
  }

  if (cmd.kind === 'workflow') {
    return `${cmd.description} (������)`
  }

  if (cmd.source === 'plugin') {
    const pluginName = cmd.pluginInfo?.pluginManifest.name
    if (pluginName) {
      return `(${pluginName}) ${cmd.description}`
    }
    return `${cmd.description} (���)`
  }

  if (cmd.source === 'builtin' || cmd.source === 'mcp') {
    return cmd.description
  }

  if (cmd.source === 'bundled') {
    return `${cmd.description} (����)`
  }

  return `${cmd.description} (${getSettingSourceName(cmd.source)})`
}
