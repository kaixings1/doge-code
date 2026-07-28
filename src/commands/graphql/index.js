const graphql = {
    type: 'local',
    name: 'graphql',
    description: '执行 GraphQL 查询',
    argumentHint: '<查询语句>',
    load: () => import('./graphql.js'),
};
export default graphql;
//# sourceMappingURL=index.js.map