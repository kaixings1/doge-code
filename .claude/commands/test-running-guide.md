---
globs: ["gui/**/*", "core/**/*"]
description: 为 GUI 和核心文件夹提供测试运行说明。
alwaysApply: false
---

When working with test files, use the following commands to run tests:

GUI folder tests:

- Run all tests: `cd gui && npm test`

Core folder tests:

- Run Jest tests: `cd core && npm test`
- Run Vitest tests: `cd core && npm run vitest`

Test file patterns:

- GUI: _.test.ts or_.test.tsx files use Vitest
- Core: _.test.ts files use Jest,_.vitest.ts files use Vitest

Best practices:

- We are transitioning to vitest, so use that when creating new tests
