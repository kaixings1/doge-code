export default {
  isEnabled: () => false,
  isHidden: true,
  name: 'summary',
  load: () => Promise.resolve({ call: async () => ({ type: 'text', value: '会话摘要' }) }),
};
