import { registerBundledSkill } from '../bundledSkills.js'

const PROMPT = '# 设置预提交钩子\n\n设置带有 lint-staged（Prettier）、类型检查和测试的 Husky 预提交钩子。\n\n## 这将设置什么\n- Husky 预提交钩子\n- lint-staged 对所有暂存文件运行 Prettier\n- Prettier 配置（如果缺失）\n- 预提交钩子中的类型检查和测试脚本\n\n## 步骤\n\n### 1. 检测包管理器\n检查 package-lock.json（npm）、pnpm-lock.yaml（pnpm）、yarn.lock（yarn）、bun.lockb（bun）。默认为 npm。\n\n### 2. 安装依赖\n将 husky、lint-staged、prettier 作为 devDependencies 安装。\n\n### 3. 初始化 Husky\n运行 npx husky init\n\n### 4. 创建 .husky/pre-commit\n```\nnpx lint-staged\nnpm run typecheck\nnpm run test\n```\n将 npm 替换为检测到的包管理器。如果那些脚本不存在则省略 typecheck/test。\n\n### 5. 创建 .lintstagedrc\n```json\n{ "*": "prettier --ignore-unknown --write" }\n```\n\n### 6. 创建 .prettierrc（如果缺失）\n默认：tabWidth 2, printWidth 80, singleQuote false, trailingComma es5, semi true。\n\n### 7. 验证\n- .husky/pre-commit 存在且可执行\n- .lintstagedrc 存在\n- package.json 中的 prepare 脚本为 "husky"\n- 运行 npx lint-staged 以验证\n\n### 8. 提交\n暂存所有文件并提交，消息为："Add pre-commit hooks (husky + lint-staged + prettier)"'

export function registerSetupPreCommitSkill(): void {
  registerBundledSkill({
    name: 'setup-pre-commit',
    description: '使用 Husky + lint-staged + Prettier + typecheck + tests 设置 pre-commit hooks。',
    whenToUse: '当用户想要添加预提交钩子、设置 Husky，或配置 lint-staged 时。',
    userInvocable: true,
    getPromptForCommand() {
      return [{ type: 'text', text: PROMPT }]
    },
  })
}