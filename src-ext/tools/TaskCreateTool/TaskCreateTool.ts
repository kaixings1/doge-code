import { Tool } from '../../Tool';
import { z } from 'zod';

const TaskCreateTool: Tool = {
  name: 'task-create',
  description: 'Create a new task',
  callOn: 'manual',
  input: z.object({
    name: z.string().describe('Task name'),
    description: z.string().optional().describe('Task description'),
    subagents: z.array(z.string()).optional().describe('Subagent names'),
  }),
  output: z.object({
    taskId: z.string().describe('Created task ID'),
    name: z.string().describe('Task name'),
    status: z.string().describe('Task status'),
  }),
  exec: async ({ name, description, subagents = [] }) => {
    return {
      taskId: `task_${Date.now()}`,
      name,
      status: 'created',
    };
  },
};

export default TaskCreateTool;
