const dependency_analyzer = {
    type: 'local',
    name: 'dependency-analyzer',
    description: '开发者工具 - dependency-analyzer',
    load: () => import('./dependency_analyzer.js'),
};
export default dependency_analyzer;
