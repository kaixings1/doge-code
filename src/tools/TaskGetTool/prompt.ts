export const DESCRIPTION = '按 ID 从任务列表获取任务'

export const PROMPT = `使用此工具根据 ID 从任务列表中获取任务。

## 何时使用此工具

- 在开始处理任务之前，需要查看完整描述和上下文时
- 理解任务依赖关系（它阻塞哪些任务，被哪些任务阻塞）
- 被分配任务后，获取完整需求时

## 输出

返回任务的完整详情：
- **subject**: 任务标题
- **description**: 详细需求和上下文
- **status**: 'pending'（待处理）、'in_progress'（进行中）或 'completed'（已完成）
- **blocks**: 等待此任务完成的其他任务
- **blockedBy**: 此任务开始前必须完成的任务

## 提示

- 获取任务后，在开始工作前验证其 blockedBy 列表为空。
- 使用 TaskList 可查看所有任务的摘要形式。
`