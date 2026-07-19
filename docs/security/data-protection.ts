export const DATA_PROTECTION = {  
  // 敏感信息过滤  
  sensitiveInfo: {  
    apiKeys: true,  
    passwords: true,  
    tokens: true,  
    emails: false,  
    phoneNumbers: false,  
  },  
  // 日志净化  
  logSanitization: {  
    enabled: true,  
    patterns: [  
      'apiKey', 'password', 'token', 'secret'  
    ],  
  },  
  // 会话加密  
  sessionEncryption: {  
    enabled: true,  
    algorithm: 'AES-256-GCM',  
  },  
}; 
