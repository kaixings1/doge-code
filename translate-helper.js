const fs = require('fs');
const path = require('path');

// 常见翻译词典
const TRANSLATIONS = {
  // 错误消息
  'Failed to': '失败:',
  'Error:': '错误:',
  'Error opening': '打开时出错',
  'Failed to open': '打开失败',
  'Unable to': '无法',
  'Cannot': '无法',
  
  // 状态消息
  'Loading...': '加载中...',
  'Please wait': '请稍候',
  'Processing': '处理中',
  'Saving': '保存中',
  'Installing': '安装中',
  'Checking': '检查中',
  
  // 提示文本
  'Warning:': '警告:',
  'Warning': '警告',
  'Success': '成功',
  'Cancelled': '已取消',
  
  // 按钮和动作
  'Continue': '继续',
  'Cancel': '取消',
  'Save': '保存',
  'Delete': '删除',
  'Edit': '编辑',
  'Open': '打开',
  'Close': '关闭',
  
  // 描述性文本
  'This will': '这将',
  'To update': '要更新',
  'To use': '要使用',
  'To change': '要更改',
  
  // 其他常见短语
  'up to date': '已是最新版本',
  'available': '可用',
  'required': '必需',
};

console.log('Translation helper loaded');
