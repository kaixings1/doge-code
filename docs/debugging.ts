export const DEBUGGING_GUIDE = {  
  // 日志级别  
  logLevels: ['debug', 'info', 'warn', 'error'],  
  // 调试命令  
  commands: {  
    verbose: 'doge --verbose',  
    debugFile: 'doge --debug-file ./debug.txt',  
    doctor: 'doge /doctor'  
  },  
  // 常见问题  
  commonIssues: [  
    '启动失败：检查 api.json 配置',  
    'API 错误：检查网络和 API Key',  
    '工具失败：查看权限设置'  
  ]  
}; 
