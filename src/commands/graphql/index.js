const graphql = {
    type: 'local',
    name: 'graphql',
    description: '执行 GraphQL 查询',
    argumentHint: '<查询语句>',
    load: () => import('./graphql.ts'),
};
export default graphql;
