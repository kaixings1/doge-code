import { registerBundledSkill } from '../bundledSkills.js'

const PROMPT = '# Setup Pre-Commit Hooks\n\nSet up Husky pre-commit hooks with lint-staged (Prettier), type checking, and tests.\n\n## What This Sets Up\n- Husky pre-commit hook\n- lint-staged running Prettier on all staged files\n- Prettier config (if missing)\n- typecheck and test scripts in the pre-commit hook\n\n## Steps\n\n### 1. Detect package manager\nCheck for package-lock.json (npm), pnpm-lock.yaml (pnpm), yarn.lock (yarn), bun.lockb (bun). Default to npm.\n\n### 2. Install dependencies\nhusky lint-staged prettier as devDependencies.\n\n### 3. Initialize Husky\nnpx husky init\n\n### 4. Create .husky/pre-commit\n```\nnpx lint-staged\nnpm run typecheck\nnpm run test\n```\nReplace npm with detected package manager. Omit typecheck/test if those scripts don\'t exist.\n\n### 5. Create .lintstagedrc\n```json\n{ "*": "prettier --ignore-unknown --write" }\n```\n\n### 6. Create .prettierrc (if missing)\nDefault: tabWidth 2, printWidth 80, singleQuote false, trailingComma es5, semi true.\n\n### 7. Verify\n- .husky/pre-commit exists and is executable\n- .lintstagedrc exists\n- prepare script in package.json is "husky"\n- Run npx lint-staged to verify\n\n### 8. Commit\nStage all files and commit with message: "Add pre-commit hooks (husky + lint-staged + prettier)"'

export function registerSetupPreCommitSkill(): void {
  registerBundledSkill({
    name: 'setup-pre-commit',
    description: 'Set up Husky pre-commit hooks with lint-staged, Prettier, typecheck, and tests.',
    whenToUse: 'When user wants to add pre-commit hooks, set up Husky, or configure lint-staged.',
    userInvocable: true,
    getPromptForCommand() {
      return [{ type: 'text', text: PROMPT }]
    },
  })
}