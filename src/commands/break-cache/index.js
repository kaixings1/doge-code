export default {
  isEnabled: () => false,
  isHidden: true,
  name: 'break-cache',
  description: '禁用缓存（开发中）',
  type: 'local',
  load: () => Promise.resolve({ call: async () => ({ type: 'text', value: 'break-cache 功能开发中' }) })
};
