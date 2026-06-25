import { registerBundledSkill } from '../bundledSkills.js'

const PROMPT = '# Migrate to Shoehorn\n\nMigrate test files from `as` type assertions to @total-typescript/shoehorn.\n\n## Why shoehorn?\n\nshoehorn lets you pass partial data in tests while keeping TypeScript happy. It replaces `as` assertions with type-safe alternatives.\n\n**Test code only.** Never use shoehorn in production code.\n\n## Install\n\n```\nnpm i @total-typescript/shoehorn\n```\n\n## Patterns\n\n### Large objects with few needed properties\n\nBefore: `{ ...entireObject } as Request`\nAfter: `fromPartial({ body: { id: \"123\" } })`\n\n### Intentionally wrong data\n\nBefore: `\"not-a-number\" as unknown as number`\nAfter: `fromPartial<number>(\"not-a-number\")`\n\n## Migration process\n\n1. Install @total-typescript/shoehorn\n2. For each test file, replace `as Type` assertions with `fromPartial()`\n3. Remove the `as` import if no longer needed\n4. Run typecheck and tests to verify'

export function registerMigrateToShoehornSkill(): void {
  registerBundledSkill({
    name: 'migrate-to-shoehorn',
    description: '将测试文件从 `as` 类型断言迁移到 @total-typescript/shoehorn，以实现类型安全的局部测试数据。',
    whenToUse: 'When user wants to replace `as` assertions in tests, improve type safety in test files, or needs partial test data patterns.',
    userInvocable: true,
    getPromptForCommand() {
      return [{ type: 'text', text: PROMPT }]
    },
  })
}