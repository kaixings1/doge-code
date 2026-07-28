export function sortLogs(logs) {
    return logs.sort((a, b) => {
        // 按修改日期排序（最新优先）
        const modifiedDiff = b.modified.getTime() - a.modified.getTime();
        if (modifiedDiff !== 0) {
            return modifiedDiff;
        }
        // 如果修改日期相同，则按创建日期排序（最新优先）
        return b.created.getTime() - a.created.getTime();
    });
}
//# sourceMappingURL=logs.js.map