export const SUCCESS_LESSONS = {
  // 1. 早期架构决策
  earlyArchitecture: {
    lesson: '早期投入时间设计清晰架构',
    benefit: '后续开发顺畅，重构成本低',
    example: 'Bridge 层设计使得后续添加新 Provider 变得简单',
  },

  // 2. 文档驱动开发
  documentationFirst: {
    lesson: '文档与代码同步更新',
    benefit: '降低维护成本，便于团队协作',
    example: '每章文档对应一个核心模块',
  },

  // 3. 类型优先
  typeFirst: {
    lesson: '先定义类型再实现逻辑',
    benefit: '减少运行时错误，提高代码质量',
    example: '100+ 类型定义确保接口一致性',
  },

  // 4. 渐进式优化
  progressiveOptimization: {
    lesson: '先实现功能再优化性能',
    benefit: '避免过早优化，保持开发速度',
    example: '先完成功能，再添加缓存和懒加载',
  },

  // 5. 测试驱动
  testDriven: {
    lesson: '为核心功能编写测试',
    benefit: '保证重构安全性，提升代码质量',
    example: '查询引擎测试覆盖率达 90%',
  },
};