const eventStream = {
    type: 'local',
    name: 'event-stream',
    description: '连接并接收 Server-Sent Events (SSE) 事件流',
    argumentHint: '<url>',
    load: () => import('./eventStream.ts'),
};
export default eventStream;
//# sourceMappingURL=index.js.map