// 清理控制字符，保留可打印内容，并限制长度为 20 字符
const sanitizeForDisplay = (text: string): string => {
  return text
    .replace(/[\r\n\t\v\f]/g, ' ')   // 各种空白字符转空格
    .replace(/\x1b\[[0-9;]*m/g, '') // 移除 ANSI 转义序列
    .replace(/[^\x20-\x7E\u4e00-\u9fa5]/g, '') // 保留 ASCII 可打印字符和中文
    .slice(-50);                    // 取最后 50 字符
};

let tokenBuffer = '';

export const appendTokenText = (delta: string) => {
  tokenBuffer += delta;
  tokenBuffer = sanitizeForDisplay(tokenBuffer);
};

export const getTokenPreview = (): string => {
  return tokenBuffer;
};