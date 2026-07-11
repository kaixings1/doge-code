const fork = {
    type: 'local',
    name: 'fork',
    description: 'Fork subagent (stub)',
    isEnabled: () => true,
    supportsNonInteractive: false,
    load: () => Promise.resolve({ call: async (_args, _context) => undefined }),
};
export default fork;
