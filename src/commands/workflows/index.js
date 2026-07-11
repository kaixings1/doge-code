const workflows = {
    type: 'local',
    name: 'workflows',
    description: 'Workflow scripts (stub)',
    isEnabled: () => true,
    supportsNonInteractive: false,
    load: () => Promise.resolve({ call: async () => { } }),
};
export default workflows;
