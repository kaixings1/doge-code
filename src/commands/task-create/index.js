const taskCreate = {
    type: 'local',
    name: 'task-create',
    description: '任务管理: 创建|list|done|delete|pause|resume|cancel|subtask|info|start|clear-done',
    argumentHint: '<任务描述>',
    load: () => import('./task-create.ts'),
};
export default taskCreate;
