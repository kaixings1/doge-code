const task = {
    type: 'local',
    name: 'task',
    description: '快速创建简单任务（简化版任务创建）',
    argumentHint: '<任务描述>',
    load: () => import('./task.ts'),
};
export default task;
