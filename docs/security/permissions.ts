export const PERMISSION_SECURITY = {  
  defaultPolicy: 'ask', // allow / deny / ask  
  dangerousOperations: {  
    fileDeletion: 'ask',  
    systemCommands: 'ask',  
    networkAccess: 'ask',  
  },  
  whitelist: {  
    paths: ['~/projects', '~/Documents'],  
    commands: ['git', 'npm', 'bun'],  
  },  
  blacklist: {  
    commands: ['rm -rf', 'format', 'mkfs'],  
    paths: ['/etc', '/var', 'C:\\Windows'],  
  },  
}; 
