const cron = {
    type: 'local',
    name: 'cron',
    description: '管理 cron 定时任务',
    argumentHint: '<cron表达式> <命令>',
    load: () => import('./cron.ts'),
};
export default cron;
//# sourceMappingURL=index.js.map