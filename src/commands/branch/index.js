import { feature } from 'bun:bundle';
const branch = {
    type: 'local-jsx',
    name: 'branch',
    // 'fork' alias only when /fork doesn't exist as its own command
    aliases: feature('FORK_SUBAGENT') ? [] : ['fork'],
    description: '在当前位置创建对话分支',
    argumentHint: '[name]',
    load: () => import('./branch.ts'),
};
export default branch;
