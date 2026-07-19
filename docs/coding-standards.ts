export const CODING_STANDARDS = {  
  // TypeScript  
  typescript: {  
    strict: false,  
    target: 'ESNext',  
    module: 'bundler',  
    jsx: 'react-jsx'  
  },  
  // 命名约定  
  naming: {  
    files: 'kebab-case',  
    classes: 'PascalCase',  
    functions: 'camelCase',  
    constants: 'UPPER_SNAKE_CASE'  
  },  
  // 代码格式化  
  formatting: {  
    tool: 'Biome',  
    indent: 2,  
    quotes: 'single'  
  }  
}; 
