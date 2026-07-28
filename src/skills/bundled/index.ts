import { feature } from 'bun:bundle'
import { isEnvTruthy } from '../../utils/envUtils.js'
import { shouldAutoEnableClaudeInChrome } from '../../utils/claudeInChrome/setup.js'
import { registerBundledSkillsSummarySkill } from './bundledSkillsSummary.js'
import { registerBatchSkill } from './batch.js'
import { registerHandoffSkill } from './handoff.js'
import { registerDiagnosingBugsSkill } from './diagnosingBugs.js'
import { registerResolvingMergeConflictsSkill } from './resolvingMergeConflicts.js'
import { registerGitGuardrailsSkill } from './gitGuardrails.js'
import { registerTddSkill } from './tdd.js'
import { registerImplementSkill } from './implement.js'
import { registerCodebaseDesignSkill } from './codebaseDesign.js'
import { registerDomainModelingSkill } from './domainModeling.js'
import { registerGrillingSkill } from './grilling.js'
import { registerGrillWithDocsSkill } from './grillWithDocs.js'
import { registerPrototypeSkill } from './prototype.js'
import { registerImproveCodebaseArchitectureSkill } from './improveCodebaseArchitecture.js'
import { registerSetupPreCommitSkill } from './setupPreCommit.js'
import { registerTeachSkill } from './teach.js'
import { registerToPrdSkill } from './toPrd.js'
import { registerToIssuesSkill } from './toIssues.js'
import { registerTriageSkill } from './triage.js'
import { registerScaffoldExercisesSkill } from './scaffoldExercises.js'
import { registerWritingGreatSkillsSkill } from './writingGreatSkills.js'
import { registerWritingBeatsSkill } from './writingBeats.js'
import { registerWritingFragmentsSkill } from './writingFragments.js'
import { registerWritingShapeSkill } from './writingShape.js'
import { registerEditArticleSkill } from './editArticle.js'
import { registerObsidianVaultSkill } from './obsidianVault.js'
import { registerAskMattSkill } from './askMatt.js'
import { registerGrillMeSkill } from './grillMe.js'
import { registerMigrateToShoehornSkill } from './migrateToShoehorn.js'
import { registerCuratorReviewSkill } from './curatorReview.js'
import { registerMemoryManagerSkill } from './memoryManager.js'
import { registerSkillBundleCommand } from './skillBundle.js'
import { registerClaudeInChromeSkill } from './claudeInChrome.js'
import { registerDebugSkill } from './debug.js'
import { registerKeybindingsSkill } from './keybindings.js'
import { registerLoremIpsumSkill } from './loremIpsum.js'
import { registerRememberSkill } from './remember.js'
import { registerSimplifySkill } from './simplify.js'
import { registerSkillifySkill } from './skillify.js'
import { registerStuckSkill } from './stuck.js'
import { registerUpdateConfigSkill } from './updateConfig.js'
import { registerVerifySkill } from './verify.js'

/**
 * Initialize all bundled skills.
 * Called at startup to register skills that ship with the CLI.
 *
 * To add a new bundled skill:
 * 1. Create a new file in src/skills/bundled/ (e.g., myskill.ts)
 * 2. Export a register function that calls registerBundledSkill()
 * 3. Import and call that function here
 */
export function initBundledSkills(): void {
  // CLAUDE_CODE_DISABLE_BUNDLED_SKILLS: 跳过所有内置技能注册
  if (isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_BUNDLED_SKILLS)) {
    return
  }

  registerUpdateConfigSkill()
  registerKeybindingsSkill()
  registerVerifySkill()
  registerDebugSkill()
  registerLoremIpsumSkill()
  registerSkillifySkill()
  registerRememberSkill()
  registerSimplifySkill()
  registerBatchSkill()
  registerHandoffSkill()
  registerDiagnosingBugsSkill()
  registerResolvingMergeConflictsSkill()
  registerGitGuardrailsSkill()
  registerTddSkill()
  registerImplementSkill()
  registerCodebaseDesignSkill()
  registerDomainModelingSkill()
  registerGrillingSkill()
  registerGrillWithDocsSkill()
  registerPrototypeSkill()
  registerImproveCodebaseArchitectureSkill()
  registerSetupPreCommitSkill()
  registerTeachSkill()
  registerToPrdSkill()
  registerToIssuesSkill()
  registerTriageSkill()
  registerScaffoldExercisesSkill()
  registerWritingGreatSkillsSkill()
  registerWritingBeatsSkill()
  registerWritingFragmentsSkill()
  registerWritingShapeSkill()
  registerEditArticleSkill()
  registerObsidianVaultSkill()
  registerAskMattSkill()
  registerGrillMeSkill()
  registerMigrateToShoehornSkill()
  registerCuratorReviewSkill()
  registerMemoryManagerSkill()
  registerSkillBundleCommand()
  registerBundledSkillsSummarySkill()
  registerStuckSkill()
  if (feature('KAIROS') || feature('KAIROS_DREAM')) {
     
    const { registerDreamSkill } = require('./dream.js')
     
    registerDreamSkill()
  }
  if (feature('REVIEW_ARTIFACT')) {
     
    const { registerHunterSkill } = require('./hunter.js')
     
    registerHunterSkill()
  }
  if (feature('AGENT_TRIGGERS')) {
     
    const { registerLoopSkill } = require('./loop.js')
     
    // /loop's isEnabled delegates to isKairosCronEnabled() — same lazy
    // per-invocation pattern as the cron tools. Registered unconditionally;
    // the skill's own isEnabled callback decides visibility.
    registerLoopSkill()
  }
  if (feature('AGENT_TRIGGERS_REMOTE')) {
     
    const {
      registerScheduleRemoteAgentsSkill,
    } = require('./scheduleRemoteAgents.js')
     
    registerScheduleRemoteAgentsSkill()
  }
  if (feature('BUILDING_CLAUDE_APPS')) {
     
    const { registerClaudeApiSkill } = require('./claudeApi.js')
     
    registerClaudeApiSkill()
  }
  if (shouldAutoEnableClaudeInChrome()) {
    registerClaudeInChromeSkill()
  }
  if (feature('RUN_SKILL_GENERATOR')) {
     
    const { registerRunSkillGeneratorSkill } = require('./runSkillGenerator.js')
     
    registerRunSkillGeneratorSkill()
  }
}
