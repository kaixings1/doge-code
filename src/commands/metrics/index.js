const metrics = {
    type: 'local',
    name: 'metrics',
    description: '显示系统性能指标和统计数据',
    load: () => import('./metrics.js'),
};
export default metrics;
