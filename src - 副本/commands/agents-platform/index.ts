const agentsPlatform = {
  name: 'agents-platform',
  type: 'local',
  description:
    '保留的内部命令。此恢复版本保持命令可见，但不包含原始的代理平台后端。',
  supportsNonInteractive: true,
  load: async () => ({
    async call() {
      return {
        type: 'text' as const,
        value:
          'agents-platform 不包含在此恢复的工作区中。\n\n' +
          '命令外壳存在以便调用者干净地失败，但 ' +
          '驱动平台管理代理的内部后端未能从 ' +
          '源代码映射中恢复。',
      }
    },
  }),
}

export default agentsPlatform
