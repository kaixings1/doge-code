/**
 * 判断是否为连接器文本块
 * @param value - 待检查的值
 * @returns 是否为连接器文本块
 */
export function isConnectorTextBlock(value) {
    // 判断是否为连接器文本块
    return !!value && typeof value === 'object' && 'text' in value;
}
//# sourceMappingURL=connectorText.js.map