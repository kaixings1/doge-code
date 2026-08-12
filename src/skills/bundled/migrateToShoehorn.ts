import { registerBundledSkill } from '../bundledSkills.js'

const PROMPT = '# 迁移到 Shoehorn\n\n将测试文件从 `as` 类型断言迁移到 @total-typescript/shoehorn。\n\n## 为什么用 shoehorn？\n\nshoehorn 允许你在测试中传递部分数据同时保持 TypeScript 满意。它用类型安全的替代方案替换 `as` 断言。\n\n**仅限测试代码。** 绝不在生产代码中使用 shoehorn。\n\n## 安装\n\n```\nnpm i @total-typescript/shoehorn\n```\n\n## 模式\n\n### 需要少量属性的对象\n\nBefore: `{ ...entireObject } as Request`\nAfter: `fromPartial({ body: { id: "123"❌ 错误:  } })`\n\n### 故意错误的数据\n\nBefore: `"not-a-number" as unknown as number`\nAfter: `fromPartial<number>("not-a-number")`\n\n## 迁移流程\n\n1. 安装 @total-typescript/shoehorn\n2. 对每个测试文件，将 `as Type` 断言替换为 `fromPartial()`\n3. 如果不再需要，移除 `as` 导入\n4. 运行类型检查和测试以验证'

export function registerMigrateToShoehornSkill(): void {
  registerBundledSkill({
    name: 'migrate-to-shoehorn',
    description: '将测试文件从 `as` 类型断言迁移到 @total-typescript/shoehorn，以实现类型安全的局部测试数据。',
    whenToUse: '当用户想要在测试中替换 `as` 断言、提高测试文件的类型安全性，或需要部分测试数据模式时。',
    userInvocable: true,
    getPromptForCommand() {
      return [{ type: 'text', text: PROMPT }]
    },
  })
}