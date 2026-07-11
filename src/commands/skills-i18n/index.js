const skillsI18n = {
    type: 'local',
    name: 'skills-i18n',
    description: '检查并修复 SKILL.md 汉化问题。用法: /skills-i18n [check|fix|force|restore]',
    supportsNonInteractive: true,
    load: () => import('./skills-i18n.js'),
};
export default skillsI18n;
