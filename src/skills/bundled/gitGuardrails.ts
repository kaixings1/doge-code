import { registerBundledSkill } from '../bundledSkills.js'

const GIT_GUARDRAILS_PROMPT = `# Setup Git Guardrails

Sets up a PreToolUse hook that intercepts and blocks dangerous git commands before Claude executes them.

## What Gets Blocked

- \`git push\` (all variants including --force)
- \`git reset --hard\`
- \`git clean -f\` / \`git clean -fd\`
- \`git branch -D\`
- \`git checkout .\` / \`git restore .\`

When blocked, Claude sees a message telling it that it does not have authority to access these commands.

## Steps

### 1. Ask scope
Ask the user: install for this project only (.claude/settings.json) or all projects (~/.claude/settings.json)?

### 2. Write the hook script
Create a shell script at the target location that blocks these commands. The script should parse the Bash tool input JSON, check if the command matches any dangerous pattern, and exit with code 2 if blocked.

### 3. Add hook to settings
Add a PreToolUse hook entry in the appropriate settings.json file that points to the script.

### 4. Ask about customization
Ask if user wants to add or remove any patterns from the blocked list.

### 5. Verify
Run a quick test to confirm the hook works.`

export function registerGitGuardrailsSkill(): void {
  registerBundledSkill({
    name: 'git-guardrails',
    description: '设置 Claude Code hooks 以阻止危险 git 命令（push、reset --hard、clean、branch -D 等）。',
    whenToUse: '当用户想要防止破坏性 git 操作、添加 git 安全钩子或阻止 Claude Code 中的 git push/reset 时使用。',
    userInvocable: true,
    disableModelInvocation: true,
    getPromptForCommand() {
      return [{ type: 'text', text: GIT_GUARDRAILS_PROMPT }]
    },
  })
}
