import { z } from 'zod/v4';
import { lazySchema } from '../lazySchema.js';
const TodoStatusSchema = lazySchema(() => z.enum(['pending', 'in_progress', 'completed']));
export const TodoItemSchema = lazySchema(() => z.object({
    content: z.string().min(1, '任务内容不能为空'),
    status: TodoStatusSchema(),
    activeForm: z.string().min(1, '具体执行步骤不能为空'),
}));
export const TodoListSchema = lazySchema(() => z.array(TodoItemSchema()));
//# sourceMappingURL=types.js.map