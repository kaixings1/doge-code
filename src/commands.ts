// biome-ignore-all assist/source/organizeImports: ANT-ONLY 导入标记不得重新排序
import { safeRequire, loadConditionalCommand } from './commands/loader.js'

import addDir from './commands/add-dir/index.ts'
import addModel from './commands/add-model/index.ts'
import removeModel from './commands/remove-model/index.ts'
import autofixPr from './commands/autofix-pr/index.js'
import backfillSessions from './commands/backfill-sessions/index.ts'
import collab from './commands/collab/index.ts'
import btw from './commands/btw/index.ts'
import goodClaude from './commands/good-claude/index.ts'
import issue from './commands/issue/index.ts'
import feedback from './commands/feedback/index.ts'
import fuck from './commands/fuck/index.ts'
import clear from './commands/clear/index.ts'
import color from './commands/color/index.ts'
import commit from './commands/commit.ts'
import copy from './commands/copy/index.ts'
import cmd from './commands/cmd/index.ts'
import glossary from './commands/glossary/index.ts'
import desktop from './commands/desktop/index.ts'
import diagnose from './commands/diagnose.ts'
import eco from './commands/eco/index.ts'
import commitPushPr from './commands/commit-push-pr.ts'
import ship from './commands/ship/index.ts'
import shipCiReviewLoop from './commands/ship/ship-ci-review-loop.ts'
import asktime from './commands/asktime/asktime.ts'
import auto from './commands/auto/index.ts'
import evolve from './commands/evolve/index.ts'
import compact from './commands/compact/index.ts'
import config from './commands/config/index.ts'
import { context, contextNonInteractive } from './commands/context/index.ts'
import cost from './commands/cost/index.ts'
import diff from './commands/diff/index.ts'
import codeSearch from './commands/code-search/index.tsx'
import sweFix from './commands/swe-fix/index.ts'
import diffMode from './commands/diff-mode/index.ts'
import diffReview from './commands/diff-review/index.ts'
import blockMode from './commands/block-mode/index.ts'
import repoMap from './commands/repo-map/index.tsx'
import repoPack from './commands/repo-pack/index.ts'
import ctx_viz from './commands/ctx_viz/index.tsx'
import doctor from './commands/doctor/index.ts'
import dogeConfig from './commands/doge-config/index.ts'
import mcpConfig from './commands/mcp-config/index.ts'
import mcpDiscovery from './commands/mcp-discovery/index.ts'
import memory from './commands/memory/index.ts'
import help from './commands/help/index.ts'
import ide from './commands/ide/index.ts'
import init from './commands/init.ts'
import initVerifiers from './commands/init-verifiers.ts'
import sessionSearch from './commands/session-search.ts'
import sessionTag from './commands/session-tag.ts'
import snapshot from './commands/snapshot/index.ts'
import keybindings from './commands/keybindings/index.ts'
import login from './commands/login/index.ts'
import logout from './commands/logout/index.ts'
import installGitHubApp from './commands/install-github-app/index.ts'
import installSlackApp from './commands/install-slack-app/index.ts'
import installFeishuApp from './commands/install-feishu-app/index.ts'
import breakCache from './commands/break-cache/index.ts'
import mcp from './commands/mcp/index.ts'
import mobile from './commands/mobile/index.ts'
import mobileConnect from './commands/mobile/connect.ts'
import onboarding from './commands/onboarding/index.tsx'
import pr_comments from './commands/pr_comments/index.ts'
import releaseNotes from './commands/release-notes/index.ts'
import rename from './commands/rename/index.ts'
import resume from './commands/resume/index.ts'
import review, { ultrareview } from './commands/review.ts'
import session from './commands/session/index.ts'
import sessions from './commands/sessions/index.tsx'
import browser from './commands/browser/index.tsx'
import { vectorSearchCommand } from './commands/vector-search/index.tsx'
import share from './commands/share/index.ts'
import skills from './commands/skills/index.ts'
import status from './commands/status/index.ts'
import tasks from './commands/tasks/index.ts'
import teleport from './commands/teleport/index.tsx'
import gettingStarted from './commands/getting-started/index.ts'
import changelog from './commands/changelog/index.ts'
import copyPage from './commands/copy-page/index.ts'
import documentationIndex from './commands/documentation-index/index.ts'
import powerup from './commands/powerup/index.ts'
import teamOnboarding from './commands/team-onboarding/index.ts'
import teamCollab from './commands/team-collab/index.js'
import projectPurge from './commands/project-purge/index.ts'
import insights from './commands/insights/index.ts'
import team from './commands/team/index.ts'
import game from './commands/game/index.ts'
import refactor from './commands/refactor.ts'
import explain from './commands/explain/index.ts'
import autocomplete from './commands/autocomplete/index.ts'
import terminalComplete from './commands/complete/index.ts'
import testGen from './commands/test-gen.ts'
import snippet from './commands/snippet/index.ts'
import autoCommit from './commands/auto-commit/index.ts'
import wiki from './commands/wiki/index.ts'
import customCmd from './commands/custom-cmd/index.ts'
import background from './commands/background/index.ts'
import bookmark from './commands/bookmark/index.ts'
import notify from './commands/notify/index.ts'
import templates from './commands/templates/index.ts'
import stash from './commands/stash/index.ts'
import codeHealth from './commands/code-health/index.ts'
import errorsCmd from './commands/errors/index.ts'
import prReview from './commands/pr-review/index.ts'
import env from './commands/env/index.ts'
import logs from './commands/logs/index.ts'
import ports from './commands/ports/index.ts'
import symbol from './commands/symbol/index.ts'
import imports from './commands/imports/index.ts'
import fmt from './commands/fmt/index.ts'
import testRun from './commands/test-run/index.ts'
import gitGraph from './commands/git-graph/index.ts'
import release from './commands/release/index.ts'
import blame from './commands/blame/index.ts'
import conflict from './commands/conflict/index.ts'
import fileHistory from './commands/file-history/index.ts'
import contributors from './commands/contributors/index.ts'
import performance from './commands/performance/index.ts'
import tc from './commands/tc/index.ts'
import security from './commands/security/index.ts'
import snippets from './commands/snippets/index.ts'
import debug from './commands/debug/index.ts'
import changelogGen from './commands/changelog-gen/index.ts'
import fileSearch from './commands/file-search/index.ts'
import apiTest from './commands/api-test/index.ts'
import dbMigrate from './commands/db-migrate/index.ts'
import codeReview from './commands/code-review/index.ts'
import projectStats from './commands/project-stats/index.ts'
import envDiff from './commands/env-diff/index.ts'
import autoModeReset from './commands/auto-mode-reset/index.ts'
import backupFull from './commands/backup-full/index.ts'
import ssh from './commands/ssh/index.ts'
import healthScore from './commands/health-score/index.ts'
import health from './commands/health/index.ts'
import loopV2 from './commands/loop-v2/index.ts'
import loopDashboard from './commands/loop-dashboard/index.ts'
import loopStartV2 from './commands/loop-start-v2/index.ts'
import loopStatusV2 from './commands/loop-status-v2/index.ts'
import notes from './commands/notes/index.ts'
import terminal from './commands/terminal/index.ts'
import watch from './commands/watch/index.ts'
import docs from './commands/docs/index.ts'
import graph from './commands/graph/index.ts'
import lighthouse from './commands/lighthouse/index.ts'
import sitemap from './commands/sitemap/index.ts'
import htaccess from './commands/htaccess/index.ts'
import robots from './commands/robots/index.ts'
import readme from './commands/readme/index.ts'
import importMap from './commands/import-map/index.ts'
import bundle from './commands/bundle/index.ts'
import deadCode from './commands/dead-code/index.ts'
import duplicate from './commands/duplicate/index.ts'
import license from './commands/license/index.ts'
import outdated from './commands/outdated/index.ts'
import tree from './commands/tree/index.ts'
import grep from './commands/grep/index.ts'
import reflect from './commands/reflect/index.ts'
import skillCreateFromSession from './commands/skill-create-from-session/index.ts'

// 导入新增的21个命令
import lessPermissionPrompts from './commands/less-permission-prompts/index.ts'
import contextCollapse from './commands/context-collapse/index.ts'
import taskCreate from './commands/task-create/index.ts'
import task from './commands/task/index.ts'
import planMode from './commands/plan-mode/index.ts'
import compare from './commands/compare/index.ts'
import graphQL from './commands/graphql/index.ts'
import http from './commands/http/index.ts'
import costHistory from './commands/cost-history/index.ts'
import replay from './commands/replay/index.ts'
import pruneSessions from './commands/prune-sessions/index.ts'
import tokens from './commands/tokens/index.ts'
import recall from './commands/recall/index.ts'
import database from './commands/database/index.ts'
import deps from './commands/deps-viz/index.ts'
import shell from './commands/shell/index.ts'
import focus from './commands/focus/index.ts'
import fileWatcher from './commands/file-watcher/index.ts'
import schedule from './commands/schedule/index.ts'
import cron from './commands/cron/index.ts'
import websocket from './commands/websocket/index.ts'
import workspace from './commands/workspace.ts'
import eventStream from './commands/event-stream/index.ts'
import queue from './commands/queue/index.ts'
import cache from './commands/cache/index.ts'
import logger from './commands/logger/index.ts'
import metrics from './commands/metrics/index.ts'
import monitor from './commands/monitor/index.ts'
import backup from './commands/backup/index.ts'
import mcpToolSearch from './commands/mcp-tool-search/index.ts'
import promptDiff from './commands/prompt-diff/index.ts'
const agentsPlatform = loadConditionalCommand(
  () => process.env.USER_TYPE === 'ant',
  () => safeRequire('./commands/agents-platform/index.js')?.default ?? null
)

import securityReview from './commands/security-review.ts'
import bughunter from './commands/bughunter/index.tsx'
import dashboard from './commands/dashboard/index.ts'
import selfCheck from './commands/self-check/index.ts'
import rules from './commands/rules/index.ts'
import terminalSetup from './commands/terminalSetup/index.ts'
import usage from './commands/usage/index.ts'
import theme from './commands/theme/index.ts'
import vim from './commands/vim/index.ts'
import { feature } from 'bun:bundle'

// 死代码消除：条件导入

const proactive = loadConditionalCommand(
  [() => process.env['CLAUDE_CODE_FEATURE_PROACTIVE'] === '1',
   () => process.env['CLAUDE_CODE_FEATURE_KAIROS'] === '1'],
  () => safeRequire('./commands/proactive.js')?.default
)
const briefCommand = loadConditionalCommand(
  [() => process.env['CLAUDE_CODE_FEATURE_KAIROS'] === '1',
   () => process.env['CLAUDE_CODE_FEATURE_KAIROS_BRIEF'] === '1'],
  () => safeRequire('./commands/brief.js')?.default
)
const assistantCommand = loadConditionalCommand(
  () => process.env['CLAUDE_CODE_FEATURE_KAIROS'] === '1',
  () => safeRequire('./commands/assistant/index.js')?.default
)
const bridge = loadConditionalCommand(
  () => process.env['CLAUDE_CODE_FEATURE_BRIDGE_MODE'] === '1',
  () => safeRequire('./commands/bridge/index.js')?.default
)
const remoteControlServerCommand = loadConditionalCommand(
  () => (process.env['CLAUDE_CODE_FEATURE_DAEMON'] === '1') &&
          (process.env['CLAUDE_CODE_FEATURE_BRIDGE_MODE'] === '1'),
  () => safeRequire('./commands/remoteControlServer/index.js')?.default
)
const voiceCommand = loadConditionalCommand(
  () => process.env['CLAUDE_CODE_FEATURE_VOICE_MODE'] === '1',
  () => safeRequire('./commands/voice/index.js')?.default
)
const forceSnip = loadConditionalCommand(
  () => process.env['CLAUDE_CODE_FEATURE_HISTORY_SNIP'] === '1',
  () => safeRequire('./commands/force-snip.js')?.default
)
const workflowsCmd = loadConditionalCommand(
  () => process.env['CLAUDE_CODE_FEATURE_WORKFLOW_SCRIPTS'] === '1',
  () => safeRequire('./commands/workflows/index.js')?.default
)
const webCmd = loadConditionalCommand(
  () => process.env['CLAUDE_CODE_FEATURE_CCR_REMOTE_SETUP'] === '1',
  () => safeRequire('./commands/remote-setup/index.js')?.default
)
const clearSkillIndexCache = loadConditionalCommand(
  () => process.env['CLAUDE_CODE_FEATURE_EXPERIMENTAL_SKILL_SEARCH'] === '1',
  () => safeRequire('./services/skillSearch/localSearch.js')?.clearSkillIndexCache
)
const subscribePr = loadConditionalCommand(
  () => process.env['CLAUDE_CODE_FEATURE_KAIROS_GITHUB_WEBHOOKS'] === '1',
  () => safeRequire('./commands/subscribe-pr.js')?.default
)
const ultraplan = loadConditionalCommand(
  () => process.env['CLAUDE_CODE_FEATURE_ULTRAPLAN'] === '1',
  () => safeRequire('./commands/ultraplan.js')?.default
)
const torch = loadConditionalCommand(
  () => process.env['CLAUDE_CODE_FEATURE_TORCH'] === '1',
  () => safeRequire('./commands/torch.js')?.default
)
const peersCmd = loadConditionalCommand(
  () => process.env['CLAUDE_CODE_FEATURE_UDS_INBOX'] === '1',
  () => safeRequire('./commands/peers/index.js')?.default
)
const forkCmd = loadConditionalCommand(
  () => process.env['CLAUDE_CODE_FEATURE_FORK_SUBAGENT'] === '1',
  () => safeRequire('./commands/fork/index.js')?.default
)
import buddy from './commands/buddy/index.ts'

import thinkback from './commands/thinkback/index.ts'
import thinkbackPlay from './commands/thinkback-play/index.ts'
import permissions from './commands/permissions/index.ts'
import plan from './commands/plan/index.ts'
import fast from './commands/fast/index.ts'
import passes from './commands/passes/index.ts'
import privacySettings from './commands/privacy-settings/index.ts'
import hooks from './commands/hooks/index.ts'
import i18nExtract from './commands/i18n-extract.ts'
import files from './commands/files/index.ts'
import branch from './commands/branch/index.ts'
import agents from './commands/agents/index.ts'
import plugin from './commands/plugin/index.tsx'
import reloadPlugins from './commands/reload-plugins/index.ts'
import rewind from './commands/rewind/index.ts'
import heapDump from './commands/heapdump/index.ts'
import mockLimits from './commands/mock-limits/index.ts'
import bridgeKick from './commands/bridge-kick.ts'
import version from './commands/version.ts'
import summary from './commands/summary/index.ts'
import bridgeSessions from './commands/bridge-sessions/index.ts'
import memoryBank from './commands/memory-bank/index.ts'
import {
  resetLimits,
  resetLimitsNonInteractive,
} from './commands/reset-limits/index.tsx'
import antTrace from './commands/ant-trace/index.tsx'
import perfIssue from './commands/perf-issue/index.tsx'
import sandboxToggle from './commands/sandbox-toggle/index.ts'
import dockerSandboxCommand from './commands/docker-sandbox/index.ts'
import chrome from './commands/chrome/index.ts'
import stickers from './commands/stickers/index.ts'
import advisor from './commands/advisor/index.ts'
import tui from './commands/tui/index.ts'
import batchHan from './commands/batch-han/index.ts'
import updateApiKey from './commands/updateapikey/index.ts'
import cloneAll from './commands/clone-all-1500/index.ts'

import apiDebug from './commands/api-debug/index.ts'
import pluginMarket from './commands/plugin-market/index.ts'
import pair from './commands/pair/index.ts'
import memorySearch from './commands/memory-search/index.ts'
import loopCommand from './commands/loop/index.tsx'
import { loopShortcuts } from './commands/loop/shortcuts.ts'
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
import { memoize } from './vendor/lodash.js'
import { isUsing3PServices, isClaudeAISubscriber } from './utils/auth.js'
import { isFirstPartyAnthropicBaseUrl } from './utils/model/providers.js'
import rstk from './commands/rstk/index.ts'
import exit from './commands/exit/index.ts'
import exportCommand from './commands/export/index.ts'
import dockerCmd from './commands/docker/index.ts'
import k8sCmd from './commands/k8s/index.ts'
import pdfCmd from './commands/pdf/index.ts'
import excelCmd from './commands/excel/index.ts'
import diagramCmd from './commands/diagram/index.ts'
import imageCmd from './commands/image/index.ts'
import apiDocCmd from './commands/api-doc/index.ts'
import deployCmd from './commands/deploy/index.ts'
import redisCmd from './commands/redis/index.ts'
import nginxCmd from './commands/nginx/index.ts'
import rag from './commands/rag/index.ts'
import stock from './commands/stock/index.ts'
import model from './commands/model/index.ts'
import tag from './commands/tag/index.ts'
import outputStyle from './commands/output-style/index.ts'
import remoteEnv from './commands/remote-env/index.ts'
import upgrade from './commands/upgrade/index.ts'
import {
  extraUsage,
  extraUsageNonInteractive,
} from './commands/extra-usage/index.ts'
import rateLimitOptions from './commands/rate-limit-options/index.ts'
import statusline from './commands/statusline.tsx'
import effort from './commands/effort/index.ts'
import stats from './commands/stats/index.ts'
// insights.ts 有 113KB（3200 行，包含 diffLines/HTML 渲染）。懒加载垫片将重型模块推迟到 /insights 实际被调用时。
const usageReport: Command = {
  type: 'prompt',
  name: 'insights',
  description: '生成分析报告，分析你的 Claude Code 会话模式',
  contentLength: 0,
  progressMessage: '正在分析你的会话',
  source: 'builtin',
  async getPromptForCommand(args, context) {
    const real = (await import('./commands/insights.js')).default
    if (real.type !== 'prompt') throw new Error('不可达代码')
    return real.getPromptForCommand(args, context)
  },
}
import oauthRefresh from './commands/oauth-refresh/index.ts'
import debugToolCall from './commands/debug-tool-call/index.ts'
// 新增开发者工具命令
import memoryMonitor from './commands/memory-monitor/index.ts'
import performanceProfiler from './commands/performance-profiler/index.ts'
import codeReviewAssistant from './commands/code-review-assistant/index.ts'
import dependencyAnalyzer from './commands/dependency-analyzer/index.ts'
import skillsI18n from './commands/skills-i18n/index.ts'
import updateskills from './commands/updateskills/index.ts'
import notebook from './commands/notebook/index.ts'
import todo from './commands/todo/index.ts'
import benchmark from './commands/benchmark/index.ts'
import scaffold from './commands/scaffold/index.ts'
import translate from './commands/translate/index.ts'
import securityAudit from './commands/security-audit/index.ts'
import agentNew from './commands/agent-new/index.ts'
import { getSettingSourceName } from './utils/settings/constants.js'
import {
  type Command,
  getCommandName,
  isCommandEnabled,
} from './types/command.js'

// 从集中位置重新导出类型
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

// 在外部构建中会被消除的命令
export const INTERNAL_ONLY_COMMANDS = [
  backfillSessions,
  breakCache,
  goodClaude,
  issue,
  initVerifiers,
  ...(forceSnip ? [forceSnip] : []),
  mockLimits,
  bridgeKick,
  ...(ultraplan ? [ultraplan] : []),
  ...(subscribePr ? [subscribePr] : []),
  resetLimits,
  resetLimitsNonInteractive,
  onboarding,
  teleport,
  antTrace,
  perfIssue,
  env,
  oauthRefresh,
  debugToolCall,
  agentsPlatform,
  autofixPr,
].filter(Boolean)

// 声明为函数，以便在调用 getCommands 时才运行，
// 因为底层函数会读取配置，而配置在模块初始化时无法读取。
const COMMANDS = memoize((): Command[] => [
  addDir,
  addModel,
  removeModel,
  advisor,
  recall,
  autocomplete,
  terminalComplete,
  agents,
  branch,
  btw,
  commit,
  commitPushPr,
  codeSearch,
  sweFix,
  chrome,
  clear,
  color,
  compact,
  config,
  copy,
  cmd,
  desktop,
  glossary,
  dogeConfig,
  mcpConfig,
  context,
  contextNonInteractive,
  ctx_viz,
  cost,
  costHistory,
  replay,
  pruneSessions,
  tokens,
  diff,
  diffMode,
  diffReview,
  blockMode,
  repoMap,
  repoPack,
  diagnose,
  eco,
  doctor,
  effort,
  exit,
  fast,
  files,
  gettingStarted,
  changelog,
  copyPage,
  documentationIndex,
  tui,
  powerup,
  teamOnboarding,
  teamCollab,
  projectPurge,
  insights,
  team,
  game,
  healthScore,
  health,
  heapDump,
  help,
  ide,
  init,
  keybindings,
  installGitHubApp,
  installSlackApp,
  installFeishuApp,
  mcp,
  mcpDiscovery,
  memory,
  mobile,
  mobileConnect,
  model,
  outputStyle,
  remoteEnv,
  plugin,
  pr_comments,
  releaseNotes,
  reloadPlugins,
  rename,
  refactor,
  explain,
  collab,
  resume,
  session,
  sessions,
  browser,
  skills,
  stats,
  status,
  statusline,
  summary,
  stickers,
  tag,
  theme,
  feedback,
  fuck,
  review,
  ultrareview,
  rewind,
  rstk,
  batchHan,
  autocomplete,
  updateApiKey,
  securityReview,
  terminalSetup,
  upgrade,
  extraUsage,
  extraUsageNonInteractive,
  rateLimitOptions,
  usage,
  usageReport,
  vectorSearchCommand,
  version,
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
  dockerCmd,
  k8sCmd,
  pdfCmd,
  excelCmd,
  diagramCmd,
  imageCmd,
  apiDocCmd,
  deployCmd,
  redisCmd,
  nginxCmd,
  rag,
  stock,
  sandboxToggle,
  dockerSandboxCommand,
  ...(!isUsing3PServices() ? [logout, login()] : []),
  passes,
  ...(peersCmd ? [peersCmd] : []),
  tasks,
  testGen,
  snippet,
  autoModeReset,
  autoCommit,
  wiki,
  customCmd,
  background,
  deps,
  bookmark,
  notify,
  templates,
  stash,
  codeHealth,
  errorsCmd,
  prReview,
  env,
  logs,
  ports,
  symbol,
  imports,
  fmt,
  testRun,
  gitGraph,
  release,
  blame,
  conflict,
  fileHistory,
  contributors,
  performance,
  tc,
  security,
  snippets,
  debug,
  changelogGen,
  fileSearch,
  apiTest,
  dbMigrate,
  codeReview,
  projectStats,
  envDiff,
  backupFull,
  ssh,
  notes,
  terminal,
  watch,
  docs,
  graph,
  lighthouse,
  sitemap,
  htaccess,
  robots,
  readme,
  importMap,
  bundle,
  deadCode,
  duplicate,
  license,
  outdated,
  tree,
  grep,
  ...(workflowsCmd ? [workflowsCmd] : []),
  ...(torch ? [torch] : []),
  lessPermissionPrompts,
  contextCollapse,
  taskCreate,
  task,
  planMode,
  compare,
  graphQL,
  http,
  database,
  shell,
  share,
  fileWatcher,
  focus,
  schedule,
  cron,
  workspace,
  websocket,
  eventStream,
  queue,
  cache,
  logger,
  metrics,
  monitor,
  backup,
  mcpToolSearch,
  promptDiff,
  // 新增开发者工具
  memoryMonitor,
  performanceProfiler,
  codeReviewAssistant,
  dependencyAnalyzer,
  skillsI18n,
  notebook,
  todo,
  benchmark,
  scaffold,
  translate,
  securityAudit,
  agentNew,
  updateskills,
  cloneAll,
  diagramCmd,
  apiDebug,
  pluginMarket,
  pair,
  memorySearch,
  sessionSearch,
  snapshot,
  loopCommand,
  ...loopShortcuts,
  loopV2,
  loopStartV2,
  loopStatusV2,
  loopDashboard,
  bridgeSessions,
  memoryBank,
  ...(process.env.USER_TYPE === 'ant' && !process.env.IS_DEMO
    ? INTERNAL_ONLY_COMMANDS
    : []),
  dashboard,
  selfCheck,
  rules,
  bughunter,
  reflect,
  skillCreateFromSession,
  ship,
  auto,
  asktime,
  evolve,
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
        logForDebugging('技能目录命令加载失败，将在无技能目录的情况下继续运行')
        return []
      }),
      getPluginSkills().catch(err => {
        logError(toError(err))
        logForDebugging('插件技能加载失败，将在无插件技能的情况下继续运行')
        return []
      }),
    ])
    // 内置技能在启动时同步注册
    const bundledSkills = getBundledSkills()
    // 内置插件技能来自已启用的内置插件
    const builtinPluginSkills = getBuiltinPluginSkillCommands()
    logForDebugging(
      `getSkills 返回：${skillDirCommands.length} 个技能目录命令，${pluginSkills.length} 个插件技能，${bundledSkills.length} 个内置技能，${builtinPluginSkills.length} 个内置插件技能`,
    )
    const planCppWin = skillDirCommands.find(c => c.name === 'plan-cpp-win')
    if (!planCppWin) {
      const planLike = skillDirCommands.filter(c => c.name.startsWith('plan')).map(c => c.name)
      logForDebugging(`=== [DEBUG] plan 开头的技能: ${planLike.join(', ')}`)
    }
    return {
      skillDirCommands,
      pluginSkills,
      bundledSkills,
      builtinPluginSkills,
    }
  } catch (err) {
    // 这不应该发生，因为我们在 Promise 级别捕获了错误，但防御一下
    logError(toError(err))
    logForDebugging('❌ 错误: getSkills 中发生意外错误，返回空数组')
    return {
      skillDirCommands: [],
      pluginSkills: [],
      bundledSkills: [],
      builtinPluginSkills: [],
    }
  }
}

const getWorkflowCommands = loadConditionalCommand(
  () => process.env['CLAUDE_CODE_FEATURE_WORKFLOW_SCRIPTS'] === '1',
  () => (safeRequire('./tools/WorkflowTool/createWorkflowCommand.js') as { getWorkflowCommands: (cwd: string) => Promise<Command[]> } | null)?.getWorkflowCommands ?? null
)

/**
 * 根据命令声明的 `availability`（认证/提供商要求）进行过滤。
 * 没有 `availability` 的命令视为通用命令。
 * 此步骤在 `isEnabled()` 之前运行，以便无论功能开关状态如何，受提供商限制的命令都会被隐藏。
 *
 * 未进行 memoization —— 认证状态可能在会话中途改变（例如 /login 之后），
 * 因此必须在每次 getCommands() 调用时重新评估。
 */
export function meetsAvailabilityRequirement(cmd: Command): boolean {
  if (!cmd.availability) return true
  for (const a of cmd.availability) {
    switch (a) {
      case 'claude-ai':
        if (isClaudeAISubscriber()) return true
        break
      case 'console':
        // Console API 密钥用户 = 直接的一手 API 客户（非第三方，非 claude.ai）。
        // 排除未设置 ANTHROPIC_BASE_URL 的第三方（Bedrock/Vertex/Foundry）
        // 以及通过自定义基础 URL 代理的网关用户。
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
 * 加载所有命令源（技能、插件、工作流）。基于 cwd 进行 memoization，
 * 因为加载开销较大（磁盘 I/O、动态导入）。
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
 * 返回当前用户可用的命令。开销较大的加载部分已 memoization，
 * 但 availability 和 isEnabled 检查每次调用都会重新执行，
 * 以便认证变更（如 /login）能立即生效。
 */
export async function getCommands(cwd: string): Promise<Command[]> {
  const allCommands = await loadAllCommands(cwd)

  // 获取在文件操作期间发现的动态技能
  const dynamicSkills = getDynamicSkills()

  // 构建不含动态技能的基础命令列表
  const baseCommands = allCommands.filter(
    _ => meetsAvailabilityRequirement(_) && isCommandEnabled(_),
  )

  if (dynamicSkills.length === 0) {
    return baseCommands
  }

  // 动态技能去重 —— 仅添加尚未存在的
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

  // 将动态技能插入到插件技能之后、内置命令之前
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
 * 仅清除命令的 memoization 缓存，而不清除技能缓存。
 * 当添加了动态技能时，使用此函数使缓存的命令列表失效。
 */
export function clearCommandMemoizationCaches(): void {
  loadAllCommands.cache?.clear?.()
  getSkillToolCommands.cache?.clear?.()
  getSlashCommandToolSkills.cache?.clear?.()
  // skillSearch/localSearch.ts 中的 getSkillIndex 是建立在
  // getSkillToolCommands/getCommands 之上的另一层 memoization。
  // 仅清除内部缓存对最外层是无效的 —— lodash memoize 会直接返回缓存结果，
  // 而不会进入已被清除的内层。必须显式清除它。
  clearSkillIndexCache?.()
}

export function clearCommandsCache(): void {
  clearCommandMemoizationCaches()
  clearPluginCommandCache()
  clearPluginSkillsCache()
  clearSkillCaches()
}

/**
 * 筛选 AppState.mcp.commands 中属于 MCP 提供的技能（prompt 类型、模型可调用、从 MCP 加载）。
 * 这些技能存在于 getCommands() 之外，因此需要它们的调用方单独将 MCP 技能传入其技能索引。
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
  if (process.env['CLAUDE_CODE_FEATURE_MCP_SKILLS'] === '1') {
    return mcpCommands.filter(
      cmd =>
        cmd.type === 'prompt' &&
        cmd.loadedFrom === 'mcp' &&
        !cmd.disableModelInvocation,
    )
  }
  return []
}

// SkillTool 展示模型可调用的所有基于 prompt 的命令
// 这包括技能（来自 /skills/）和命令（来自 /commands/）
export const getSkillToolCommands = memoize(
  async (cwd: string): Promise<Command[]> => {
    const allCommands = await getCommands(cwd)
    return allCommands.filter(
      cmd =>
        cmd.type === 'prompt' &&
        !cmd.disableModelInvocation &&
        cmd.source !== 'builtin' &&
        // 始终包含 /skills/ 目录中的技能、内置技能以及旧的 /commands/ 条目
        // （即使缺少 frontmatter，它们也会从第一行自动获得描述）。
        // 插件/MCP 命令仍需显式描述才能出现在列表中。
        (cmd.loadedFrom === 'bundled' ||
          cmd.loadedFrom === 'skills' ||
          cmd.loadedFrom === 'commands_DEPRECATED' ||
          cmd.hasUserSpecifiedDescription ||
          cmd.whenToUse),
    )
  },
)

// 筛选命令，仅包含技能。技能是为模型提供专用能力的命令。
// 通过 loadedFrom 为 'skills'、'plugin' 或 'bundled'，或 disableModelInvocation 设置为 true 来识别。
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
      // 返回空数组而非抛出异常 —— 技能是非关键的
      // 这可以防止技能加载失败导致整个系统崩溃
      logForDebugging('由于加载失败，返回空的技能数组')
      return []
    }
  },
)

/**
 * 在远程模式（--remote）下安全使用的命令。
 * 这些命令仅影响本地 TUI 状态，不依赖于本地文件系统、git、shell、IDE、MCP 或其他本地执行上下文。
 *
 * 用于两处：
 * 1. 在 main.tsx 中渲染 REPL 之前预过滤命令（防止与 CCR 初始化产生竞态）
 * 2. 在 REPL 的 handleRemoteInit 中，CCR 过滤后仍保留仅限本地的命令
 */
export const REMOTE_SAFE_COMMANDS: Set<Command> = new Set([
  session, // 显示远程会话的二维码/URL
  exit, // 退出 TUI
  clear, // 清屏
  help, // 显示帮助
  theme, // 更改终端主题
  color, // 更改 agent 颜色
  vim, // 切换 vim 模式
  cost, // 显示会话成本（本地成本跟踪）
  usage, // 显示使用信息
  cmd, // 搜索和浏览可用命令
  copy, // 复制最后一条消息
  glossary, // 查看项目术语表
  mcpConfig, // 管理项目级 MCP 服务器配置
  dogeConfig, // 管理 doge 配置（API 地址、密钥、模型等）
  btw, // 快速备注
  feedback, // 发送反馈
  plan, // 计划模式切换
  keybindings, // 快捷键管理
  statusline,
  summary, // 状态行切换
  stickers, // 贴纸
  mobile, // 移动端二维码
]) as Set<Command>

/**
 * 类型为 'local' 的内置命令中，当通过远程控制桥接器收到时**可以**安全执行的那些。
 * 这些命令会生成文本输出，流式传回移动端/Web 客户端，且没有仅限终端的副作用。
 *
 * 'local-jsx' 命令根据类型被阻止（它们渲染 Ink UI），
 * 'prompt' 命令根据类型被允许（它们展开为发送给模型的文本）——
 * 此集合仅限制 'local' 命令。
 *
 * 添加一个能在移动端工作的新 'local' 命令时，请将其添加至此。默认阻止。
 */
export const BRIDGE_SAFE_COMMANDS: Set<Command> = new Set(
  [
    compact, // 压缩上下文 —— 在手机上会话中期很有用
    clear, // 清空对话记录
    cost, // 显示会话成本
    summary, // 总结对话
    releaseNotes, // 显示更新日志
    files, // 列出跟踪的文件
  ].filter((c): c is Command => c !== null),
)

/**
 * 判断一个斜杠命令在其输入通过远程控制桥接器（移动端/Web 客户端）到达时是否可以安全执行。
 *
 * PR #19134 曾全面阻止来自桥接器入站的所有斜杠命令，因为 iOS 上的 `/model` 会弹出本地的 Ink 选择器。
 * 此断言通过显式允许列表放宽了该限制：'prompt' 命令（技能）会展开为文本，本身是安全的；
 * 'local' 命令需要显式通过 BRIDGE_SAFE_COMMANDS 选择加入；'local-jsx' 命令渲染 Ink UI，保持阻止。
 */
export function isBridgeSafeCommand(cmd: Command): boolean {
  if (cmd.type === 'local-jsx') return false
  if (cmd.type === 'prompt') return true
  return BRIDGE_SAFE_COMMANDS.has(cmd)
}

/**
 * 筛选命令，仅保留对远程模式安全的命令。
 * 用于在 --remote 模式下渲染 REPL 时预过滤命令，防止本地专属命令在 CCR 初始化消息到达前短暂可用。
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
      `命令 ${commandName} 未找到。可用命令：${commands
        .map(_ => {
          const name = getCommandName(_)
          return _.aliases ? `${name} (别名：${_.aliases.join(', ')})` : name
        })
        .sort((a, b) => a.localeCompare(b))
        .join(', ')}`,
    )
  }

  return command
}

/**
 * 格式化命令的描述，并附上其来源标注，用于面向用户的 UI。
 * 在 typeahead、帮助界面及其他需要向用户展示命令来源的地方使用。
 *
 * 对于面向模型的提示（如 SkillTool），直接使用 cmd.description。
 */
export function formatDescriptionWithSource(cmd: Command): string {
  if (cmd.type !== 'prompt') {
    return cmd.description
  }

  if (cmd.kind === 'workflow') {
    return `${cmd.description} (工作流)`
  }

  if (cmd.source === 'plugin') {
    const pluginName = cmd.pluginInfo?.pluginManifest.name
    if (pluginName) {
      return `(${pluginName}) ${cmd.description}`
    }
    return `${cmd.description} (插件)`
  }

  if (cmd.source === 'builtin' || cmd.source === 'mcp') {
    return cmd.description
  }

  if (cmd.source === 'bundled') {
    return `${cmd.description} (内置)`
  }

  return `${cmd.description} (${getSettingSourceName(cmd.source)})`
}