import { registerBundledSkill } from '../bundledSkills.js'

export function registerResolvingMergeConflictsSkill(): void {
  registerBundledSkill({
    name: 'resolving-merge-conflicts',
    description: '解决正在进行的 git merge/rebase 冲突。',
    whenToUse: '当 git merge 或 git rebase 过程中出现冲突需要解决时使用。',
    userInvocable: true,
    getPromptForCommand() {
      return [{
        type: 'text',
        text: '1. **查看当前状态**。查看 git 历史和冲突文件。\n2. **找到原始来源**。深入理解每个变更的原因和原始用意。阅读提交消息、检查 PR、原始 issues/tickets。\n3. **解决每个冲突块**。尽可能保留双方的用意。始终解决冲突，从不 --abort。\n4. **运行项目的自动化检查**（类型检查、测试、格式化）。修复 merge 破坏的任何内容。\n5. **完成 merge/rebase**。暂存所有文件并提交。如果是 rebase，继续 rebase 过程直到所有提交都被 rebase 完成。',
      }]
    },
  })
}
