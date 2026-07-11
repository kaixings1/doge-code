const peers = {
    type: 'local',
    name: 'peers',
    description: 'Peer sessions (stub)',
    isEnabled: () => false,
    isHidden: true,
    supportsNonInteractive: false,
    load: () => Promise.resolve({ call: async (_args, _context) => undefined }),
};
export default peers;
