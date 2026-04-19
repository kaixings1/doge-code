/**
 * 扫描 src/目录中的 TypeScript 文件，检测典型需要汉化的英文字符串
 */

const fs = require('fs');
const path = require('path');

// 典型的需要汉化位置 - 正则表达式模式
const SCAN_PATTERNS = [
    // 变量名 (function, const, var, let)
    /(\b(const|let|var|const)\s+)+\w[\w\d]*\b/gi,
    
    // 函数名
    /\b(function\s+\w+)\{/gi,
    
    // class/接口定义 - 简化模式（去掉 \s*）
    /(\b(class\b|\b(interface\b)\s*\)/gi,
    
    // 对象属性（方法名）- 简化模式
    /(\w+)\s*\([^)]*\)\s*\{/gi,
    
    // 注释 - C++风格
    /\/\*[\s\S]*?\*\/\s*/,
    
    // 技术术语
    /\b(RPC|WebSocket|HTTP|JSON|Buffer|Encoding|Decoder|Encoder|Session|Message|Event|State|Config|Debug|Trace)\b/gi,
];

const srcDir = path.join(__dirname, '..');

// 统计信息
let totalScanned = 0;
let filesWithEnglishText = [];

console.log('\n========================================');
console.log('   扫描程序英文字符串 (用于汉化)');
console.log('========================================\n');

try {
    const entries = fs.readdirSync(srcDir, { detailedDirectoryEntryCount: true });
    
    for (const entry of entries) {
        const fullPath = path.join(srcDir, entry);
        
        if (fs.statSync(fullPath).isDirectory() && !entry.startsWith('.')) {
            const stats = fs.statSync(fullPath);
            if (stats.isDirectory() && stats.nlinkCount > 1) continue;
            
            console.log(`[扫描] ${entry}`);
            processDirectory(fullPath, entry);
        } else {
            totalScanned++;
        }
    }
} catch (e) {
    console.error(`[错误] 扫描失败：${e.message}`);
}

console.log(`\n========================================`);
console.log(`总文件数：${totalScanned}, 需汉化数量：${filesWithEnglishText.length}`);
console.log('========================================\n');

export { totalScanned, filesWithEnglishText };

/**
 * 递归扫描目录并处理英文字符串
 */
function processDirectory(dirPath, prefix) {
    const entries = fs.readdirSync(dirPath, { detailedDirectoryEntryCount: true });
    
    for (const entry of entries) {
        if (fs.statSync(`${dirPath}/${entry}`).isDirectory() && !entry.startsWith('.')) {
            processDirectory(`${dirPath}/${entry}`, `${prefix}${entry}/`);
        } else {
            const content = fs.readFileSync(`${dirPath}/${entry}`, 'utf8');
            
            for (const pattern of SCAN_PATTERNS) {
                const matches = content.match(pattern) || [];
                if (matches.length > 0 && !prefix.endsWith('/')) {
                    const englishTexts = matches.map(m => m.trim());
                    console.log(`[扫描] ${entry}: 发现 ${englishTexts.length} 个英文字符串`);
                    
                    for (let i = 0; i < englishTexts.length; i++) {
                        if (englishTexts[i].length > 5) {
                            const shortText = englishTexts[i].length > 17 
                                ? englishTexts[i].substring(0, 17) + '...' 
                                : englishTexts[i];
                            
                            console.log(`   ${i+1}. "${shortText}"`);
                        }
                    }
                }
            }
        }
    }
}
