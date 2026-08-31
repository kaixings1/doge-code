/** 类型守卫：检查图片 PastedContent 是否非空。来自零字节文件拖拽的空内容
 * 会产生空 base64 字符串，API 会因 "image cannot be empty" 而拒绝。
 * 在所有将 PastedContent 转换为 ImageBlockParam 的位置使用此守卫，
 * 以确保过滤器和 ID 列表保持同步。 */
export function isValidImagePaste(c) {
    return c.type === 'image' && c.content.length > 0;
}
/** 从 QueuedCommand 的 pastedContents 中提取图片粘贴 ID。 */
export function getImagePasteIds(pastedContents) {
    if (!pastedContents) {
        return undefined;
    }
    const ids = Object.values(pastedContents)
        .filter(isValidImagePaste)
        .map(c => c.id);
    return ids.length > 0 ? ids : undefined;
}
