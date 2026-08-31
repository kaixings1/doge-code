const http = {
    type: 'local',
    name: 'http',
    description: '发送 HTTP 请求并查看响应结果',
    argumentHint: '<method> <url> [body]',
    load: () => import('./http.ts'),
};
export default http;
