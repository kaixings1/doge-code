const releaseNotes = {
    description: '查看发布说明',
    name: 'release-notes',
    type: 'local',
    supportsNonInteractive: true,
    load: () => import('./release-notes.ts'),
};
export default releaseNotes;
//# sourceMappingURL=index.js.map