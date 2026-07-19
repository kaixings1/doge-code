export const CHECKLIST = {  
  // 开发前检查  
  beforeDevelopment: [  
    '安装 Bun 运行时',  
    '克隆仓库',  
    '安装依赖 (bun install)',  
    '配置 API (api.json)',  
    '注册全局命令 (bun link)'  
  ],  
  // 开发中检查  
  duringDevelopment: [  
    '运行 lint 检查 (bun run lint)',  
    '运行类型检查 (npx tsc --noEmit)',  
    '运行测试 (bun run test)',  
    '更新相关文档'  
  ],  
  // 提交前检查  
  beforeCommit: [  
    '所有测试通过',  
    'Lint 检查通过',  
    '类型检查通过',  
    '文档已更新'  
  ],  
}; 
