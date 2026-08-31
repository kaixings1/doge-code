import fs from 'fs';
import path from 'path';
const CACHE_DIR = path.join(process.env.HOME || process.env.USERPROFILE || '.', '.doge', 'cache');
const CACHE_TYPES = {
    'prompt': ['*.prompt.cache', '*.prompt.json'],
    'response': ['*.response.cache', '*.response.json'],
    'session': ['*.session.cache', '*.session.json'],
    'model': ['*.model.cache', '*.model.json'],
    'tool': ['*.tool.cache', '*.tool.json'],
    'all': ['*']
};
const call = async (args) => {
    const action = (args || '').trim().toLowerCase();
    if (action === 'help' || action === '') {
        return {
            type: 'text',
            value: [
                '🗑️ 缓存管理工具',
                '',
                '📖 用法: ',
                ' /break-cache status - 查看缓存状态',
                ' /break-cache list - 列出所有缓存文件',
                ' /break-cache stats - 显示详细统计',
                ' /break-cache clear - 清除所有缓存',
                ' /break-cache clear <type> - 清除指定类型缓存',
                ' /break-cache rebuild - 重建缓存索引',
                ' /break-cache dry-run - 模拟清除操作',
                ' /break-cache analyze - 分析缓存使用情况',
                ' /break-cache optimize - 优化缓存存储',
                '',
                '缓存类型:',
                ' prompt - 提示词缓存',
                ' response - 响应缓存',
                ' session - 会话缓存',
                ' model - 模型缓存',
                ' tool - 工具缓存',
                ' all - 所有缓存',
                '',
                '💡 示例: ',
                ' /break-cache status',
                ' /break-cache clear prompt',
                ' /break-cache dry-run'
            ].join('\n')
        };
    }
    try {
        // 确保缓存目录存在
        ensureCacheDir();
        if (action === 'status' || action === 'st') {
            return await showCacheStatus();
        }
        if (action === 'list') {
            return await listCacheFiles();
        }
        if (action === 'stats') {
            return await showCacheStats();
        }
        if (action === 'clear') {
            return await clearAllCache();
        }
        if (action.startsWith('clear ')) {
            const cacheType = action.replace(/^clear\s+/, '').trim();
            return await clearCacheByType(cacheType);
        }
        if (action === 'rebuild') {
            return await rebuildCache();
        }
        if (action === 'dry-run') {
            return await dryRunClear();
        }
        if (action === 'analyze') {
            return await analyzeCache();
        }
        if (action === 'optimize') {
            return await optimizeCache();
        }
        return {
            type: 'text',
            value: `❌ 未知命令: ${action}\n使用 /break-cache help 查看帮助。`
        };
    }
    catch (error) {
        return {
            type: 'text',
            value: `❌ 执行命令时出错: ${error instanceof Error ? error.message : String(error)}`
        };
    }
};
function ensureCacheDir() {
    try {
        if (!fs.existsSync(CACHE_DIR)) {
            fs.mkdirSync(CACHE_DIR, { recursive: true });
        }
    }
    catch (error) {
        throw new Error(`创建缓存目录失败: ${error instanceof Error ? error.message : String(error)}`);
    }
}
function getCacheFiles() {
    try {
        if (!fs.existsSync(CACHE_DIR)) {
            return [];
        }
        return fs.readdirSync(CACHE_DIR)
            .filter(file => file.endsWith('.cache') || file.endsWith('.json'))
            .map(file => path.join(CACHE_DIR, file));
    }
    catch (error) {
        throw new Error(`读取缓存文件失败: ${error instanceof Error ? error.message : String(error)}`);
    }
}
function getCacheStats() {
    const files = getCacheFiles();
    const stats = {
        totalFiles: 0,
        totalSize: 0,
        byType: {},
        oldestFile: null,
        newestFile: null
    };
    let oldestTime = Infinity;
    let newestTime = 0;
    for (const filePath of files) {
        try {
            const fileStat = fs.statSync(filePath);
            const fileName = path.basename(filePath);
            // 确定文件类型
            let fileType = 'other';
            for (const [type, patterns] of Object.entries(CACHE_TYPES)) {
                if (patterns.some(pattern => {
                    if (pattern === '*')
                        return true;
                    const regex = new RegExp(pattern.replace('*', '.*').replace('.', '\\.'));
                    return regex.test(fileName);
                })) {
                    fileType = type;
                    break;
                }
            }
            // 更新统计
            stats.totalFiles++;
            stats.totalSize += fileStat.size;
            if (!stats.byType[fileType]) {
                stats.byType[fileType] = { count: 0, size: 0 };
            }
            stats.byType[fileType].count++;
            stats.byType[fileType].size += fileStat.size;
            // 更新最旧/最新文件
            const mtime = fileStat.mtime.getTime();
            if (mtime < oldestTime) {
                oldestTime = mtime;
                stats.oldestFile = fileName;
            }
            if (mtime > newestTime) {
                newestTime = mtime;
                stats.newestFile = fileName;
            }
        }
        catch (error) {
            // 跳过无法访问的文件
            console.warn(`无法访问文件 ${filePath}:`, error);
        }
    }
    return stats;
}
async function showCacheStatus() {
    try {
        const stats = getCacheStats();
        const cacheDirExists = fs.existsSync(CACHE_DIR);
        const lines = [
            '📊 缓存状态',
            ''
        ];
        if (!cacheDirExists) {
            lines.push('缓存目录不存在。');
            lines.push('首次使用时会自动创建。');
            return {
                type: 'text',
                value: lines.join('\n')
            };
        }
        if (stats.totalFiles === 0) {
            lines.push('当前没有缓存文件。');
            lines.push('缓存将在使用过程中自动创建。');
            return {
                type: 'text',
                value: lines.join('\n')
            };
        }
        lines.push(`缓存目录: ${CACHE_DIR}`);
        lines.push(`文件总数: ${stats.totalFiles}`);
        lines.push(`总大小: ${formatSize(stats.totalSize)}`);
        if (stats.oldestFile && stats.newestFile) {
            lines.push(`最旧文件: ${stats.oldestFile}`);
            lines.push(`最新文件: ${stats.newestFile}`);
        }
        // 按类型显示统计
        const sortedTypes = Object.entries(stats.byType)
            .sort((a, b) => b[1].size - a[1].size);
        if (sortedTypes.length > 0) {
            lines.push('\n📈 按类型统计:');
            for (const [type, typeStats] of sortedTypes) {
                const percentage = (typeStats.size / stats.totalSize * 100).toFixed(1);
                lines.push(`  ${type}: ${typeStats.count} 文件, ${formatSize(typeStats.size)} (${percentage}%)`);
            }
        }
        lines.push('\n💡 建议:');
        if (stats.totalSize > 100 * 1024 * 1024) { // 超过100MB
            lines.push('  缓存较大，建议清理或优化。');
        }
        if (Object.keys(stats.byType).length > 5) {
            lines.push('  缓存类型较多，建议定期清理。');
        }
        return {
            type: 'text',
            value: lines.join('\n')
        };
    }
    catch (error) {
        return {
            type: 'text',
            value: `❌ 获取缓存状态时出错: ${error instanceof Error ? error.message : String(error)}`
        };
    }
}
async function listCacheFiles() {
    try {
        const files = getCacheFiles();
        if (files.length === 0) {
            return {
                type: 'text',
                value: '当前没有缓存文件。'
            };
        }
        const lines = ['📋 缓存文件列表', ''];
        // 按修改时间排序
        const fileInfos = files.map(filePath => {
            try {
                const stats = fs.statSync(filePath);
                return {
                    path: filePath,
                    name: path.basename(filePath),
                    size: stats.size,
                    mtime: stats.mtime,
                    age: Date.now() - stats.mtime.getTime()
                };
            }
            catch (error) {
                return null;
            }
        }).filter(Boolean);
        fileInfos.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
        for (const info of fileInfos.slice(0, 20)) {
            if (!info)
                continue;
            const ageDays = Math.floor(info.age / (1000 * 60 * 60 * 24));
            const ageHours = Math.floor((info.age % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const ageText = ageDays > 0 ? `${ageDays}天前` : `${ageHours}小时前`;
            lines.push(`${formatSize(info.size).padStart(10)} | ${ageText.padEnd(8)} | ${info.name}`);
        }
        if (files.length > 20) {
            lines.push(`\n...还有 ${files.length - 20} 个文件未显示`);
        }
        lines.push('\n💡 使用 /break-cache clear <type> 清理特定类型的缓存');
        return {
            type: 'text',
            value: lines.join('\n')
        };
    }
    catch (error) {
        return {
            type: 'text',
            value: `❌ 列出缓存文件时出错: ${error instanceof Error ? error.message : String(error)}`
        };
    }
}
async function showCacheStats() {
    try {
        const stats = getCacheStats();
        const files = getCacheFiles();
        if (files.length === 0) {
            return {
                type: 'text',
                value: '当前没有缓存文件。'
            };
        }
        // 计算年龄分布
        const ageGroups = {
            '1小时内': 0,
            '24小时内': 0,
            '7天内': 0,
            '30天内': 0,
            '超过30天': 0
        };
        let totalAge = 0;
        for (const filePath of files) {
            try {
                const stats = fs.statSync(filePath);
                const age = Date.now() - stats.mtime.getTime();
                totalAge += age;
                if (age < 60 * 60 * 1000) {
                    ageGroups['1小时内']++;
                }
                else if (age < 24 * 60 * 60 * 1000) {
                    ageGroups['24小时内']++;
                }
                else if (age < 7 * 24 * 60 * 60 * 1000) {
                    ageGroups['7天内']++;
                }
                else if (age < 30 * 24 * 60 * 60 * 1000) {
                    ageGroups['30天内']++;
                }
                else {
                    ageGroups['超过30天']++;
                }
            }
            catch (error) {
                // 跳过无法访问的文件
            }
        }
        const averageAge = files.length > 0 ? totalAge / files.length : 0;
        const averageAgeDays = Math.floor(averageAge / (1000 * 60 * 60 * 24));
        const lines = [
            '📈 缓存详细统计',
            '',
            `总文件数: ${stats.totalFiles}`,
            `总大小: ${formatSize(stats.totalSize)}`,
            `平均文件大小: ${formatSize(stats.totalFiles > 0 ? stats.totalSize / stats.totalFiles : 0)}`,
            `平均年龄: ${averageAgeDays} 天`,
            '',
            '📅 文件年龄分布:'
        ];
        for (const [group, count] of Object.entries(ageGroups)) {
            if (count > 0) {
                const percentage = (count / stats.totalFiles * 100).toFixed(1);
                lines.push(`  ${group}: ${count} 文件 (${percentage}%)`);
            }
        }
        lines.push('\n🗂️ 按类型分布:');
        const sortedTypes = Object.entries(stats.byType)
            .sort((a, b) => b[1].size - a[1].size);
        for (const [type, typeStats] of sortedTypes) {
            const sizePercentage = (typeStats.size / stats.totalSize * 100).toFixed(1);
            const countPercentage = (typeStats.count / stats.totalFiles * 100).toFixed(1);
            lines.push(`  ${type}: ${typeStats.count} 文件 (${countPercentage}%), ${formatSize(typeStats.size)} (${sizePercentage}%)`);
        }
        // 建议
        lines.push('\n💡 优化建议:');
        if (ageGroups['超过30天'] > stats.totalFiles * 0.3) {
            lines.push('  超过30天的文件较多，建议清理旧缓存。');
        }
        if (stats.totalSize > 500 * 1024 * 1024) { // 超过500MB
            lines.push('  缓存总大小超过500MB，建议清理。');
        }
        if (sortedTypes.length > 0 && sortedTypes[0][1].size > stats.totalSize * 0.5) {
            lines.push(`  ${sortedTypes[0][0]} 类型占用超过50%，建议针对性清理。`);
        }
        return {
            type: 'text',
            value: lines.join('\n')
        };
    }
    catch (error) {
        return {
            type: 'text',
            value: `❌ 获取缓存统计时出错: ${error instanceof Error ? error.message : String(error)}`
        };
    }
}
async function clearAllCache() {
    try {
        const files = getCacheFiles();
        let deletedCount = 0;
        let errorCount = 0;
        let totalFreed = 0;
        for (const filePath of files) {
            try {
                const stats = fs.statSync(filePath);
                totalFreed += stats.size;
                fs.unlinkSync(filePath);
                deletedCount++;
            }
            catch (error) {
                errorCount++;
                console.warn(`无法删除文件 ${filePath}:`, error);
            }
        }
        const lines = ['🧹 缓存清理完成', ''];
        lines.push(`删除文件数: ${deletedCount}`);
        lines.push(`释放空间: ${formatSize(totalFreed)}`);
        if (errorCount > 0) {
            lines.push(`删除失败数: ${errorCount}`);
        }
        if (deletedCount === 0) {
            lines.push('\n💡 没有找到需要清理的缓存文件。');
        }
        else {
            lines.push('\n✅ 所有缓存已清除，应用可能需要重启以生效。');
        }
        return {
            type: 'text',
            value: lines.join('\n')
        };
    }
    catch (error) {
        return {
            type: 'text',
            value: `❌ 清理缓存时出错: ${error instanceof Error ? error.message : String(error)}`
        };
    }
}
async function clearCacheByType(cacheType) {
    try {
        const validTypes = Object.keys(CACHE_TYPES);
        if (!validTypes.includes(cacheType) && cacheType !== 'all') {
            return {
                type: 'text',
                value: `❌ 无效的缓存类型: ${cacheType}\n有效类型: ${validTypes.join(', ')}`
            };
        }
        const files = getCacheFiles();
        let deletedCount = 0;
        let errorCount = 0;
        let totalFreed = 0;
        for (const filePath of files) {
            const fileName = path.basename(filePath);
            let shouldDelete = false;
            if (cacheType === 'all') {
                shouldDelete = true;
            }
            else {
                const patterns = CACHE_TYPES[cacheType];
                shouldDelete = patterns.some(pattern => {
                    if (pattern === '*')
                        return true;
                    const regex = new RegExp(pattern.replace('*', '.*').replace('.', '\\.'));
                    return regex.test(fileName);
                });
            }
            if (shouldDelete) {
                try {
                    const stats = fs.statSync(filePath);
                    totalFreed += stats.size;
                    fs.unlinkSync(filePath);
                    deletedCount++;
                }
                catch (error) {
                    errorCount++;
                }
            }
        }
        const lines = [`🧹 ${cacheType} 缓存清理完成`, ''];
        lines.push(`删除文件数: ${deletedCount}`);
        lines.push(`释放空间: ${formatSize(totalFreed)}`);
        if (errorCount > 0) {
            lines.push(`删除失败数: ${errorCount}`);
        }
        if (deletedCount === 0) {
            lines.push('\n💡 没有找到该类型的缓存文件。');
        }
        else {
            lines.push('\n✅ 清理完成。');
        }
        return {
            type: 'text',
            value: lines.join('\n')
        };
    }
    catch (error) {
        return {
            type: 'text',
            value: `❌ 清理缓存类型时出错: ${error instanceof Error ? error.message : String(error)}`
        };
    }
}
async function rebuildCache() {
    try {
        // 这里可以添加重建缓存索引的逻辑
        // 目前先返回一个提示信息
        return {
            type: 'text',
            value: [
                '🔧 缓存重建',
                '',
                '缓存重建功能需要集成到主应用中。',
                '',
                '💡 建议的重建步骤:',
                '1. 备份当前缓存',
                '2. 清除无效或损坏的缓存项',
                '3. 重新生成缓存索引',
                '4. 验证缓存完整性',
                '',
                '对于简单的缓存系统，重建通常意味着:',
                '• 删除所有缓存文件',
                '• 让应用在运行时重新生成缓存'
            ].join('\n')
        };
    }
    catch (error) {
        return {
            type: 'text',
            value: `❌ 重建缓存时出错: ${error instanceof Error ? error.message : String(error)}`
        };
    }
}
async function dryRunClear() {
    try {
        const stats = getCacheStats();
        const files = getCacheFiles();
        if (files.length === 0) {
            return {
                type: 'text',
                value: '当前没有缓存文件，无需清理。'
            };
        }
        // 模拟删除：只统计不实际删除
        const lines = ['🔍 模拟清理操作', ''];
        lines.push(`将删除文件数: ${stats.totalFiles}`);
        lines.push(`将释放空间: ${formatSize(stats.totalSize)}`);
        lines.push('\n📋 将删除的文件类型:');
        const sortedTypes = Object.entries(stats.byType)
            .sort((a, b) => b[1].size - a[1].size);
        for (const [type, typeStats] of sortedTypes) {
            lines.push(`  ${type}: ${typeStats.count} 文件, ${formatSize(typeStats.size)}`);
        }
        lines.push('\n💡 这只是一个模拟操作，没有实际删除任何文件。');
        lines.push('使用 /break-cache clear 执行实际清理。');
        return {
            type: 'text',
            value: lines.join('\n')
        };
    }
    catch (error) {
        return {
            type: 'text',
            value: `❌ 模拟清理时出错: ${error instanceof Error ? error.message : String(error)}`
        };
    }
}
async function analyzeCache() {
    try {
        const stats = getCacheStats();
        const files = getCacheFiles();
        if (files.length === 0) {
            return {
                type: 'text',
                value: '当前没有缓存文件可供分析。'
            };
        }
        // 分析缓存效率
        const analysisLines = ['🔬 缓存分析报告', ''];
        // 1. 总体评估
        if (stats.totalSize < 10 * 1024 * 1024) { // 小于10MB
            analysisLines.push('📊 总体评估: 缓存规模适中，效率良好。');
        }
        else if (stats.totalSize < 100 * 1024 * 1024) { // 小于100MB
            analysisLines.push('📊 总体评估: 缓存规模较大，建议定期清理。');
        }
        else {
            analysisLines.push('📊 总体评估: 缓存规模过大，建议立即清理。');
        }
        // 2. 类型分布分析
        analysisLines.push('\n📈 类型分布分析:');
        const sortedTypes = Object.entries(stats.byType)
            .sort((a, b) => b[1].size - a[1].size);
        for (const [type, typeStats] of sortedTypes) {
            const percentage = (typeStats.size / stats.totalSize * 100).toFixed(1);
            analysisLines.push(`  ${type}: ${percentage}% 占用`);
            // 类型特定建议
            if (type === 'prompt' && percentage > 30) {
                analysisLines.push('    💡 提示词缓存占用较高，考虑优化提示词复用');
            }
            if (type === 'response' && percentage > 40) {
                analysisLines.push('    💡 响应缓存占用较高，考虑压缩或设置过期时间');
            }
        }
        // 3. 文件大小分析
        let smallFiles = 0;
        let mediumFiles = 0;
        let largeFiles = 0;
        for (const filePath of files) {
            try {
                const fileStat = fs.statSync(filePath);
                if (fileStat.size < 1024) { // 小于1KB
                    smallFiles++;
                }
                else if (fileStat.size < 1024 * 1024) { // 小于1MB
                    mediumFiles++;
                }
                else {
                    largeFiles++;
                }
            }
            catch (error) {
                // 跳过无法访问的文件
            }
        }
        analysisLines.push('\n📏 文件大小分析:');
        analysisLines.push(`  小文件(<1KB): ${smallFiles}`);
        analysisLines.push(`  中文件(1KB-1MB): ${mediumFiles}`);
        analysisLines.push(`  大文件(>1MB): ${largeFiles}`);
        if (smallFiles > files.length * 0.5) {
            analysisLines.push('  💡 小文件较多，可能影响文件系统性能');
        }
        if (largeFiles > 10) {
            analysisLines.push('  💡 大文件较多，考虑拆分或压缩');
        }
        // 4. 建议
        analysisLines.push('\n💡 优化建议:');
        if (stats.totalSize > 50 * 1024 * 1024) {
            analysisLines.push('  1. 立即清理缓存释放空间');
        }
        if (sortedTypes.length > 0 && sortedTypes[0][1].size > stats.totalSize * 0.6) {
            analysisLines.push(`  2. 重点清理 ${sortedTypes[0][0]} 类型缓存`);
        }
        analysisLines.push('  3. 考虑设置缓存过期策略');
        analysisLines.push('  4. 定期使用 /break-cache optimize 优化缓存');
        return {
            type: 'text',
            value: analysisLines.join('\n')
        };
    }
    catch (error) {
        return {
            type: 'text',
            value: `❌ 分析缓存时出错: ${error instanceof Error ? error.message : String(error)}`
        };
    }
}
async function optimizeCache() {
    try {
        const statsBefore = getCacheStats();
        // 这里可以实现具体的优化逻辑，例如：
        // 1. 删除过期的缓存
        // 2. 压缩大文件
        // 3. 合并小文件
        // 目前先返回一个信息性消息
        return {
            type: 'text',
            value: [
                '⚡ 缓存优化',
                '',
                '缓存优化功能需要集成到主应用中。',
                '',
                '💡 建议的优化策略:',
                '1. 删除30天以上的旧缓存',
                '2. 压缩大于1MB的缓存文件',
                '3. 合并大量小文件',
                '4. 重建缓存索引',
                '',
                '当前缓存状态:',
                `  文件总数: ${statsBefore.totalFiles}`,
                `  总大小: ${formatSize(statsBefore.totalSize)}`,
                '',
                '优化操作可能需要一些时间，建议在空闲时进行。'
            ].join('\n')
        };
    }
    catch (error) {
        return {
            type: 'text',
            value: `❌ 优化缓存时出错: ${error instanceof Error ? error.message : String(error)}`
        };
    }
}
function formatSize(bytes) {
    if (bytes === 0)
        return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
const breakCache = {
    type: 'local',
    name: 'break-cache',
    description: '清除和重建提示/响应缓存，提供详细的缓存管理功能',
    supportsNonInteractive: true,
    load: () => Promise.resolve({ call }),
};
export default breakCache;
