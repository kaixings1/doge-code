const queue = {
    type: 'local',
    name: 'queue',
    description: '管理消息队列',
    load: () => import('./queue.ts'),
};
export default queue;
//# sourceMappingURL=index.js.map