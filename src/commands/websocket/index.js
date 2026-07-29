const websocket = {
    type: 'local',
    name: 'websocket',
    description: '通过 WebSocket 连接与服务器实时通信',
    argumentHint: '<url>',
    load: () => import('./websocket.ts'),
};
export default websocket;
//# sourceMappingURL=index.js.map