const teamOnboarding = {
    type: 'local-jsx',
    name: 'team-onboarding',
    description: '为团队成员生成 Claude Code 快速上手指南',
    load: () => import('./team-onboarding.ts'),
};
export default teamOnboarding;
