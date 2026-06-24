import { registerBundledSkill } from '../bundledSkills.js'

const TDD_PROMPT = `# Test-Driven Development

## Core Principle
Tests should verify behavior through public interfaces, not implementation details. Code can change entirely; tests shouldn't.

Good tests are integration-style: they exercise real code paths through public APIs. They describe what the system does, not how it does it.

## Anti-Pattern: Horizontal Slices
DO NOT write all tests first, then all implementation. This produces crap tests.

Correct approach: Vertical slices via tracer bullets. One test, one implementation, repeat. Each test responds to what you learned from the previous cycle.

## Workflow

### 1. Planning
Before writing any code:
- Confirm with user what interface changes are needed
- Confirm which behaviors to test (prioritize)
- List the behaviors to test (not implementation steps)
- Get user approval on the plan

### 2. Tracer Bullet
Write ONE test that confirms ONE thing about the system:
RED: Write test for first behavior, test fails
GREEN: Write minimal code to pass, test passes

### 3. Incremental Loop
For each remaining behavior:
RED: Write next test, fails
GREEN: Minimal code to pass, passes

Rules:
- One test at a time
- Only enough code to pass current test
- Don't anticipate future tests
- Keep tests focused on observable behavior

### 4. Refactor
After all tests pass:
- Extract duplication
- Deepen modules (move complexity behind simple interfaces)
- Apply SOLID principles where natural
- Run tests after each refactor step

Never refactor while RED. Get to GREEN first.

## Checklist Per Cycle
- Test describes behavior, not implementation
- Test uses public interface only
- Test would survive internal refactor
- Code is minimal for this test
- No speculative features added
`

export function registerTddSkill(): void {
  registerBundledSkill({
    name: 'tdd',
    description: '测试驱动开发。按红-绿-重构循环逐步构建功能。',
    whenToUse: '当用户想要以测试先行的方式构建功能或修复 bug，提到 "red-green-refactor" 或需要集成测试时使用。',
    userInvocable: true,
    getPromptForCommand() {
      return [{ type: 'text', text: TDD_PROMPT }]
    },
  })
}
