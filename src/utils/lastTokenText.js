// 压缩字符串用于显示，只保留可显示字符，最多 20 字符
const sanitizeForDisplay = (text) => {
    return text
        .replace(/[\r\n\t\v\f]/g, ' ') // 控制字符替换为空格
        .replace(/\x1b\[[0-9;]*m/g, '') // 移除 ANSI 转义码
        .replace(/[^\x20-\x7E\u4e00-\u9fa5]/g, '') // 保留 ASCII 和显示字符，移除其他
        .slice(-50); // 取最后 50 字符
};
let tokenBuffer = '';
export const appendTokenText = (delta) => {
    tokenBuffer += delta;
    tokenBuffer = sanitizeForDisplay(tokenBuffer);
};
export const getTokenPreview = () => {
    return tokenBuffer;
};
