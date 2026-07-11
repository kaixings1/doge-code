import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, extname, basename, resolve } from 'path';
// 代码审查器类
class CodeReviewer {
    // 安全检测模式
    securityPatterns = [
        { pattern: /\beval\s*\(/, issue: '使用eval函数存在代码注入风险', severity: 'critical' },
        { pattern: /Function\s*\(/, issue: '使用Function构造函数存在安全风险', severity: 'high' },
        { pattern: /innerHTML\s*=/, issue: '直接设置innerHTML可能导致XSS攻击', severity: 'high' },
        { pattern: /outerHTML\s*=/, issue: '直接设置outerHTML可能导致XSS攻击', severity: 'high' },
        { pattern: /document\.write\s*\(/, issue: '使用document.write可能导致XSS', severity: 'medium' },
        { pattern: /password\s*=\s*['"][^'"]*['"]/, issue: '发现硬编码密码', severity: 'critical' },
        { pattern: /apiKey\s*=\s*['"][^'"]*['"]/, issue: '发现硬编码API密钥', severity: 'critical' },
        { pattern: /secret\s*=\s*['"][^'"]*['"]/, issue: '发现硬编码密钥', severity: 'critical' },
        { pattern: /token\s*=\s*['"][^'"]*['"]/, issue: '发现硬编码令牌', severity: 'critical' },
        { pattern: /\.exec\s*\(/, issue: '使用exec可能命令注入风险', severity: 'high' },
        { pattern: /child_process\.spawn/, issue: '子进程执行需验证输入', severity: 'medium' },
        { pattern: /fs\.readFileSync\s*\([^)]*\)/, issue: '文件读取需路径验证', severity: 'medium' },
        { pattern: /JSON\.parse\s*\([^)]*\)/, issue: 'JSON解析需验证输入', severity: 'medium' },
    ];
    // 代码质量问题模式
    qualityPatterns = [
        { pattern: /\/\/\s*TODO:/, issue: '发现未完成的TODO注释', severity: 'info' },
        { pattern: /\/\/\s*FIXME:/, issue: '发现需要修复的FIXME注释', severity: 'low' },
        { pattern: /\/\/\s*HACK:/, issue: '发现临时解决方案HACK注释', severity: 'medium' },
        { pattern: /console\.(log|warn|error|info)\s*\(/, issue: '发现调试代码残留', severity: 'low' },
        { pattern: /debugger;/, issue: '发现调试器语句', severity: 'medium' },
        { pattern: /catch\s*\([^)]*\)\s*{\s*}/, issue: '空的异常处理块', severity: 'medium' },
        { pattern: /catch\s*\([^)]*\)\s*{\s*console\./, issue: '仅打印日志的异常处理', severity: 'low' },
        { pattern: /if\s*\([^)]*\)\s*{\s*}\s*else/, issue: '空的if语句块', severity: 'low' },
        { pattern: /for\s*\([^)]*\)\s*{\s*}/, issue: '空的循环语句块', severity: 'low' },
        { pattern: /while\s*\([^)]*\)\s*{\s*}/, issue: '空的while循环块', severity: 'low' },
    ];
    // 最佳实践模式
    bestPracticePatterns = [
        { pattern: /let\s+\w+\s*=\s*['"\d]/, issue: '考虑使用const替代let声明常量', severity: 'info' },
        { pattern: /var\s+\w+/, issue: '建议使用let/const替代var', severity: 'low' },
        { pattern: /function\s+\w+\s*\([^)]*\)\s*{/, issue: '考虑使用箭头函数', severity: 'info' },
        { pattern: /['"][^'"]{20,}['"]/, issue: '发现长字符串，考虑提取为常量', severity: 'info' },
        { pattern: /\d{5,}/, issue: '发现魔法数字，考虑提取为常量', severity: 'info' },
        { pattern: /\.then\([^)]*\)\.catch/, issue: '考虑使用async/await替代Promise链', severity: 'info' },
        { pattern: /callback\s*\([^)]*\)/, issue: '考虑使用Promise/async替代回调', severity: 'info' },
    ];
    // 性能问题模式
    performancePatterns = [
        { pattern: /setInterval\s*\([^)]*,\s*\d+\)/, issue: 'setInterval可能导致内存泄漏', severity: 'medium' },
        { pattern: /setTimeout\s*\([^)]*,\s*0\)/, issue: 'setTimeout(..., 0)可能影响性能', severity: 'low' },
        { pattern: /JSON\.stringify\s*\([^)]*\)\s+JSON\.parse/, issue: '不必要的JSON序列化/反序列化', severity: 'low' },
        { pattern: /array\.forEach/, issue: 'forEach无法中断，考虑使用for循环', severity: 'info' },
        { pattern: /\.innerHTML\s*=\s*['"][^'"]*['"]\s*\+/, issue: '字符串拼接可能影响性能', severity: 'low' },
    ];
    // 可维护性问题模式
    maintainabilityPatterns = [
        { pattern: /function\s+\w+\s*\([^)]{50,}\)/, issue: '函数参数过多，考虑重构', severity: 'medium' },
        { pattern: /{\s*[\s\S]{200,}\s*}/, issue: '函数体过长，考虑拆分', severity: 'medium' },
        { pattern: /if\s*\([^)]{100,}\)/, issue: '条件表达式过于复杂', severity: 'medium' },
        { pattern: /class\s+\w+\s*{[\s\S]{500,}}/, issue: '类定义过长，考虑拆分', severity: 'medium' },
        { pattern: /\/\/[^\n]{100,}/, issue: '注释过长，考虑拆分', severity: 'info' },
    ];
    // 分析单个文件
    analyzeFile(filePath) {
        try {
            if (!existsSync(filePath)) {
                return null;
            }
            const content = readFileSync(filePath, 'utf-8');
            const lines = content.split('\n');
            const issues = [];
            // 按行分析代码
            lines.forEach((line, lineIndex) => {
                const lineNumber = lineIndex + 1;
                // 检查安全模式
                this.securityPatterns.forEach(pattern => {
                    if (pattern.pattern.test(line)) {
                        issues.push({
                            type: 'security',
                            severity: pattern.severity,
                            line: lineNumber,
                            message: pattern.issue,
                            suggestion: this.getSecuritySuggestion(pattern.issue),
                            codeSnippet: line.trim().substring(0, 100)
                        });
                    }
                });
                // 检查代码质量
                this.qualityPatterns.forEach(pattern => {
                    if (pattern.pattern.test(line)) {
                        issues.push({
                            type: 'quality',
                            severity: pattern.severity,
                            line: lineNumber,
                            message: pattern.issue,
                            suggestion: this.getQualitySuggestion(pattern.issue),
                            codeSnippet: line.trim().substring(0, 100)
                        });
                    }
                });
                // 检查最佳实践
                this.bestPracticePatterns.forEach(pattern => {
                    if (pattern.pattern.test(line)) {
                        issues.push({
                            type: 'best-practice',
                            severity: pattern.severity,
                            line: lineNumber,
                            message: pattern.issue,
                            suggestion: this.getBestPracticeSuggestion(pattern.issue),
                            codeSnippet: line.trim().substring(0, 100)
                        });
                    }
                });
                // 检查性能问题
                this.performancePatterns.forEach(pattern => {
                    if (pattern.pattern.test(line)) {
                        issues.push({
                            type: 'performance',
                            severity: pattern.severity,
                            line: lineNumber,
                            message: pattern.issue,
                            suggestion: this.getPerformanceSuggestion(pattern.issue),
                            codeSnippet: line.trim().substring(0, 100)
                        });
                    }
                });
                // 检查可维护性
                this.maintainabilityPatterns.forEach(pattern => {
                    if (pattern.pattern.test(line)) {
                        issues.push({
                            type: 'maintainability',
                            severity: pattern.severity,
                            line: lineNumber,
                            message: pattern.issue,
                            suggestion: this.getMaintainabilitySuggestion(pattern.issue),
                            codeSnippet: line.trim().substring(0, 100)
                        });
                    }
                });
            });
            // 计算质量分数 (0-100)
            const score = this.calculateQualityScore(issues, lines.length);
            // 统计问题严重程度
            const summary = {
                critical: issues.filter(i => i.severity === 'critical').length,
                high: issues.filter(i => i.severity === 'high').length,
                medium: issues.filter(i => i.severity === 'medium').length,
                low: issues.filter(i => i.severity === 'low').length,
                info: issues.filter(i => i.severity === 'info').length
            };
            const stats = statSync(filePath);
            return {
                filePath,
                fileName: basename(filePath),
                fileSize: stats.size,
                lineCount: lines.length,
                issues,
                score,
                summary
            };
        }
        catch (error) {
            console.error(`分析文件 ${filePath} 失败:`, error);
            return null;
        }
    }
    // 分析整个项目
    analyzeProject(projectPath, filePatterns = ['*.ts', '*.tsx', '*.js', '*.jsx']) {
        const files = [];
        const fileAnalyses = [];
        let totalIssues = 0;
        // 收集文件
        const collectFiles = (dir) => {
            try {
                const items = readdirSync(dir, { withFileTypes: true });
                for (const item of items) {
                    const fullPath = join(dir, item.name);
                    if (item.isDirectory() && !item.name.startsWith('.') && item.name !== 'node_modules') {
                        collectFiles(fullPath);
                    }
                    else if (item.isFile()) {
                        const ext = extname(item.name).toLowerCase();
                        if (filePatterns.some(pattern => pattern.startsWith('*.') && ext === pattern.slice(1) ||
                            pattern === '*' || pattern === '.*')) {
                            files.push(fullPath);
                        }
                    }
                }
            }
            catch (error) {
                console.error(`遍历目录 ${dir} 失败:`, error);
            }
        };
        collectFiles(projectPath);
        // 分析每个文件
        for (const file of files.slice(0, 100)) { // 限制分析文件数量
            const analysis = this.analyzeFile(file);
            if (analysis) {
                fileAnalyses.push(analysis);
                totalIssues += analysis.issues.length;
            }
        }
        // 统计分数分布
        const filesByScore = {
            excellent: fileAnalyses.filter(f => f.score >= 90).length,
            good: fileAnalyses.filter(f => f.score >= 70 && f.score < 90).length,
            fair: fileAnalyses.filter(f => f.score >= 50 && f.score < 70).length,
            poor: fileAnalyses.filter(f => f.score < 50).length
        };
        // 按类型统计问题
        const issuesByType = {};
        const issuesBySeverity = {};
        fileAnalyses.forEach(analysis => {
            analysis.issues.forEach(issue => {
                issuesByType[issue.type] = (issuesByType[issue.type] || 0) + 1;
                issuesBySeverity[issue.severity] = (issuesBySeverity[issue.severity] || 0) + 1;
            });
        });
        // 获取最严重的问题
        const allIssues = fileAnalyses.flatMap(f => f.issues);
        const topIssues = allIssues
            .sort((a, b) => this.getSeverityWeight(b.severity) - this.getSeverityWeight(a.severity))
            .slice(0, 10);
        // 生成建议
        const recommendations = this.generateRecommendations(fileAnalyses);
        return {
            projectPath,
            filesAnalyzed: fileAnalyses.length,
            totalIssues,
            filesByScore,
            issuesByType,
            issuesBySeverity,
            topIssues,
            recommendations
        };
    }
    // 辅助方法
    calculateQualityScore(issues, lineCount) {
        if (lineCount === 0)
            return 100;
        let penalty = 0;
        issues.forEach(issue => {
            switch (issue.severity) {
                case 'critical':
                    penalty += 10;
                    break;
                case 'high':
                    penalty += 5;
                    break;
                case 'medium':
                    penalty += 2;
                    break;
                case 'low':
                    penalty += 1;
                    break;
                case 'info':
                    penalty += 0.5;
                    break;
            }
        });
        const issueDensity = penalty / lineCount;
        const rawScore = 100 - (issueDensity * 1000);
        return Math.max(0, Math.min(100, Math.round(rawScore)));
    }
    getSeverityWeight(severity) {
        switch (severity) {
            case 'critical': return 5;
            case 'high': return 4;
            case 'medium': return 3;
            case 'low': return 2;
            case 'info': return 1;
            default: return 0;
        }
    }
    getSecuritySuggestion(issue) {
        const suggestions = {
            '使用eval函数存在代码注入风险': '使用JSON.parse或Function构造函数替代，并严格验证输入',
            '使用Function构造函数存在安全风险': '避免使用Function构造函数，使用其他安全的方法',
            '直接设置innerHTML可能导致XSS攻击': '使用textContent或DOM操作API，或使用DOMPurify清理HTML',
            '发现硬编码密码': '将敏感信息存储在环境变量或配置文件中',
            '使用exec可能命令注入风险': '使用spawn并验证和清理输入参数',
            '子进程执行需验证输入': '验证所有用户输入，使用白名单过滤命令参数',
            '文件读取需路径验证': '验证文件路径，避免目录遍历攻击',
            'JSON解析需验证输入': '验证JSON输入，使用try-catch处理解析错误'
        };
        return suggestions[issue] || '请参考安全最佳实践文档';
    }
    getQualitySuggestion(issue) {
        const suggestions = {
            '发现未完成的TODO注释': '尽快完成TODO任务或创建issue跟踪',
            '发现需要修复的FIXME注释': '优先修复FIXME标记的问题',
            '发现临时解决方案HACK注释': '将临时方案重构为正式实现',
            '发现调试代码残留': '移除生产环境中的调试代码',
            '发现调试器语句': '移除生产环境中的调试器语句',
            '空的异常处理块': '添加适当的错误处理逻辑',
            '仅打印日志的异常处理': '考虑添加恢复逻辑或上报错误',
            '空的if语句块': '移除空语句或添加实际逻辑',
            '空的循环语句块': '检查循环逻辑是否正确'
        };
        return suggestions[issue] || '改进代码质量';
    }
    getBestPracticeSuggestion(issue) {
        const suggestions = {
            '考虑使用const替代let声明常量': '将不会重新赋值的变量声明为const',
            '建议使用let/const替代var': '使用let/const有更好的作用域控制',
            '考虑使用箭头函数': '箭头函数有更简洁的语法和正确的this绑定',
            '发现长字符串，考虑提取为常量': '将长字符串提取为命名常量提高可读性',
            '发现魔法数字，考虑提取为常量': '将魔法数字提取为命名常量',
            '考虑使用async/await替代Promise链': 'async/await使异步代码更易读',
            '考虑使用Promise/async替代回调': '使用Promise/async改善代码结构'
        };
        return suggestions[issue] || '遵循JavaScript最佳实践';
    }
    getPerformanceSuggestion(issue) {
        const suggestions = {
            'setInterval可能导致内存泄漏': '确保在组件卸载时清理定时器',
            'setTimeout(..., 0)可能影响性能': '考虑使用requestAnimationFrame或微任务',
            '不必要的JSON序列化/反序列化': '避免不必要的JSON转换',
            'forEach无法中断，考虑使用for循环': '使用for循环以便在需要时中断',
            '字符串拼接可能影响性能': '考虑使用模板字符串或数组join'
        };
        return suggestions[issue] || '优化性能关键路径';
    }
    getMaintainabilitySuggestion(issue) {
        const suggestions = {
            '函数参数过多，考虑重构': '使用对象参数或拆分函数',
            '函数体过长，考虑拆分': '将长函数拆分为多个小函数',
            '条件表达式过于复杂': '提取条件为命名函数或变量',
            '类定义过长，考虑拆分': '将大类拆分为多个小类或使用组合',
            '注释过长，考虑拆分': '将长注释拆分为多个段落或提取文档'
        };
        return suggestions[issue] || '提高代码可维护性';
    }
    generateRecommendations(fileAnalyses) {
        const recommendations = [];
        const criticalCount = fileAnalyses.reduce((sum, f) => sum + f.summary.critical, 0);
        const highCount = fileAnalyses.reduce((sum, f) => sum + f.summary.high, 0);
        const poorFiles = fileAnalyses.filter(f => f.score < 50);
        if (criticalCount > 0) {
            recommendations.push(`发现${criticalCount}个严重安全问题，需要立即处理`);
        }
        if (highCount > 0) {
            recommendations.push(`发现${highCount}个高风险问题，建议尽快修复`);
        }
        if (poorFiles.length > 0) {
            recommendations.push(`${poorFiles.length}个文件质量较差(分数<50)，需要重点优化`);
        }
        const securityFiles = fileAnalyses.filter(f => f.summary.critical + f.summary.high > 0);
        if (securityFiles.length > 0) {
            recommendations.push(`${securityFiles.length}个文件存在安全问题，建议安全审计`);
        }
        const totalLines = fileAnalyses.reduce((sum, f) => sum + f.lineCount, 0);
        const issueDensity = fileAnalyses.reduce((sum, f) => sum + f.issues.length, 0) / totalLines;
        if (issueDensity > 0.1) {
            recommendations.push(`问题密度较高(${issueDensity.toFixed(2)}问题/行)，建议代码审查`);
        }
        if (recommendations.length === 0) {
            recommendations.push('代码质量良好，继续保持');
            recommendations.push('建议定期运行代码审查');
        }
        return recommendations;
    }
}
const reviewer = new CodeReviewer();
// 主命令函数
export const call = async (onDone, context, args) => {
    const parts = args?.trim().split(/\s+/) || [];
    const command = parts[0]?.toLowerCase() || 'help';
    const cwd = context?.getAppState?.()?.cwd || process.cwd();
    try {
        // 帮助命令
        if (command === 'help' || command === '') {
            return {
                type: 'jsx',
                render: () => [
                    '🔍 高级代码审查助手 v2.0',
                    '==============================',
                    '',
                    '核心功能:',
                    ' • 自动化代码质量分析',
                    ' • 安全漏洞检测',
                    ' • 性能问题识别',
                    ' • 最佳实践检查',
                    ' • 可维护性评估',
                    '',
                    '主要命令:',
                    ' check <文件路径> - 检查单个文件',
                    ' scan <目录> - 扫描整个目录',
                    ' security <文件> - 深度安全检查',
                    ' report - 生成分析报告',
                    ' patterns - 查看检测模式',
                    ' stats - 查看统计信息',
                    ' fix - 生成修复建议',
                    '',
                    '📝 用法示例:',
                    ' /code-review-assistant check src/utils/helper.ts',
                    ' /code-review-assistant scan src',
                    ' /code-review-assistant security src/api/auth.ts',
                    ' /code-review-assistant report',
                    '',
                    '🔧 检测范围:',
                    ' • 安全漏洞 (eval、XSS、硬编码密钥等)',
                    ' • 代码质量 (TODO、调试代码、空异常处理等)',
                    ' • 最佳实践 (const、async/await、魔法字符串等)',
                    ' • 性能问题 (内存泄漏、不必要的操作等)',
                    ' • 可维护性 (长函数、复杂条件、过长注释等)'
                ].join('\n')
            };
        }
        // 查看检测模式
        if (command === 'patterns') {
            return {
                type: 'jsx',
                render: () => {
                    const patterns = [
                        '🔒 安全检测模式:',
                        ' • eval() - 代码注入风险',
                        ' • Function() - 动态代码执行风险',
                        ' • innerHTML/outerHTML - XSS攻击风险',
                        ' • 硬编码密码/密钥 - 安全泄露风险',
                        ' • child_process.exec - 命令注入风险',
                        ' • 未验证的用户输入 - 各种注入风险',
                        '',
                        '📊 代码质量模式:',
                        ' • TODO/FIXME/HACK - 未完成或临时代码',
                        ' • console.log/debugger - 调试代码残留',
                        ' • 空的异常处理 - 错误处理不完整',
                        ' • 空的语句块 - 逻辑不完整',
                        '',
                        '🏆 最佳实践模式:',
                        ' • var声明 - 建议使用let/const',
                        ' • 函数声明 - 建议使用箭头函数',
                        ' • 长字符串/魔法数字 - 建议提取常量',
                        ' • Promise链 - 建议使用async/await',
                        ' • 回调函数 - 建议使用Promise',
                        '',
                        '⚡ 性能模式:',
                        ' • setInterval - 可能内存泄漏',
                        ' • setTimeout(0) - 可能性能问题',
                        ' • 不必要的JSON操作 - 性能浪费',
                        ' • 字符串拼接 - 可能性能问题',
                        '',
                        '🔧 可维护性模式:',
                        ' • 过长函数 - 建议拆分',
                        ' • 过多参数 - 建议重构',
                        ' • 复杂条件 - 建议简化',
                        ' • 过长注释 - 建议拆分',
                        '',
                        '💡 检测原理:',
                        ' 基于正则表达式模式匹配，',
                        ' 结合代码上下文分析，',
                        ' 提供具体修复建议。'
                    ];
                    return patterns.join('\n');
                }
            };
        }
        // 检查单个文件
        if (command === 'check' && parts.length > 1) {
            const filePath = parts.slice(1).join(' ');
            const absolutePath = resolve(cwd, filePath);
            const analysis = reviewer.analyzeFile(absolutePath);
            if (!analysis) {
                return {
                    type: 'jsx',
                    render: () => [
                        '❌ 文件分析失败',
                        '',
                        `文件: ${filePath}`,
                        `绝对路径: ${absolutePath}`,
                        '',
                        '💡 可能的原因:',
                        '1. 文件不存在',
                        '2. 没有读取权限',
                        '3. 文件编码问题',
                        '4. 路径错误',
                        '',
                        '🔍 检查步骤:',
                        '1. 确认文件路径是否正确',
                        '2. 运行 ls -la 查看文件',
                        '3. 检查文件权限',
                        '4. 尝试使用绝对路径'
                    ].join('\n')
                };
            }
            return {
                type: 'jsx',
                render: () => {
                    const lines = [
                        '📋 代码审查报告',
                        '===============',
                        '',
                        `文件: ${analysis.fileName}`,
                        `路径: ${analysis.filePath}`,
                        `大小: ${(analysis.fileSize / 1024).toFixed(1)} KB`,
                        `行数: ${analysis.lineCount}`,
                        `质量分数: ${analysis.score}/100`,
                        '',
                        '📊 问题统计:',
                        ` 🔴 严重: ${analysis.summary.critical}`,
                        ` 🟠 高风险: ${analysis.summary.high}`,
                        ` 🟡 中风险: ${analysis.summary.medium}`,
                        ` 🟢 低风险: ${analysis.summary.low}`,
                        ` 🔵 信息: ${analysis.summary.info}`,
                        ` 总计: ${analysis.issues.length}`,
                        ''
                    ];
                    // 质量评估
                    lines.push('📈 质量评估:');
                    if (analysis.score >= 90) {
                        lines.push(' • ✅ 优秀 - 代码质量非常好');
                    }
                    else if (analysis.score >= 70) {
                        lines.push(' • 👍 良好 - 代码质量不错');
                    }
                    else if (analysis.score >= 50) {
                        lines.push(' • ⚠️ 一般 - 需要改进');
                    }
                    else {
                        lines.push(' • 🚨 较差 - 需要重点优化');
                    }
                    lines.push('');
                    // 显示最严重的问题
                    if (analysis.issues.length > 0) {
                        const criticalIssues = analysis.issues.filter(i => i.severity === 'critical' || i.severity === 'high');
                        if (criticalIssues.length > 0) {
                            lines.push('🚨 严重问题:');
                            criticalIssues.slice(0, 3).forEach(issue => {
                                lines.push(` • 第${issue.line}行: ${issue.message}`);
                                if (issue.suggestion) {
                                    lines.push(`   建议: ${issue.suggestion}`);
                                }
                            });
                            lines.push('');
                        }
                        const otherIssues = analysis.issues.filter(i => i.severity !== 'critical' && i.severity !== 'high');
                        if (otherIssues.length > 0) {
                            lines.push('📝 其他问题:');
                            otherIssues.slice(0, 5).forEach(issue => {
                                const severityIcon = issue.severity === 'medium' ? '🟡' :
                                    issue.severity === 'low' ? '🟢' : '🔵';
                                lines.push(` ${severityIcon} 第${issue.line}行: ${issue.message}`);
                            });
                            if (otherIssues.length > 5) {
                                lines.push(`   ...还有${otherIssues.length - 5}个问题`);
                            }
                            lines.push('');
                        }
                    }
                    else {
                        lines.push('🎉 未发现问题，代码质量优秀！');
                        lines.push('');
                    }
                    // 建议
                    lines.push('💡 改进建议:');
                    if (analysis.summary.critical > 0) {
                        lines.push(' 1. 🔴 立即修复所有严重安全问题');
                    }
                    if (analysis.summary.high > 0) {
                        lines.push(' 2. 🟠 尽快修复高风险问题');
                    }
                    if (analysis.score < 70) {
                        lines.push(' 3. 🟡 整体代码质量需要提升');
                    }
                    if (analysis.issues.length > 10) {
                        lines.push(' 4. 🔧 问题较多，建议分批修复');
                    }
                    if (analysis.issues.length === 0) {
                        lines.push(' 1. 🎯 继续保持优秀代码质量');
                        lines.push(' 2. 🔄 定期运行代码审查');
                        lines.push(' 3. 📚 分享最佳实践给团队');
                    }
                    return lines.join('\n');
                }
            };
        }
        // 扫描目录
        if (command === 'scan') {
            const scanPath = parts.length > 1 ? resolve(cwd, parts.slice(1).join(' ')) : cwd;
            return {
                type: 'jsx',
                render: () => [
                    '🔍 目录扫描模式',
                    '===============',
                    '',
                    `扫描目录: ${scanPath}`,
                    '',
                    '📊 扫描功能:',
                    ' • 递归分析所有源代码文件',
                    ' • 检测多种代码问题',
                    ' • 生成质量报告',
                    ' • 提供修复建议',
                    '',
                    '📁 支持的文件类型:',
                    ' • TypeScript (.ts, .tsx)',
                    ' • JavaScript (.js, .jsx)',
                    ' • 其他文本文件',
                    '',
                    '⏰ 扫描过程:',
                    ' 1. 收集目录中的文件',
                    ' 2. 逐个分析文件内容',
                    ' 3. 统计问题并计算分数',
                    ' 4. 生成汇总报告',
                    '',
                    '💡 使用建议:',
                    ' • 大型项目建议分批扫描',
                    ' • 关注严重和高风险问题',
                    ' • 定期扫描监控代码质量',
                    ' • 将扫描集成到CI/CD',
                    '',
                    '🚀 开始扫描:',
                    ' 实际扫描功能需要集成到主应用中。',
                    ' 当前版本仅提供演示功能。',
                    '',
                    '📝 示例命令:',
                    ' /code-review-assistant scan src',
                    ' /code-review-assistant scan .',
                    ' /code-review-assistant scan tests'
                ].join('\n')
            };
        }
        // 安全检查
        if (command === 'security' && parts.length > 1) {
            const filePath = parts.slice(1).join(' ');
            const absolutePath = resolve(cwd, filePath);
            return {
                type: 'jsx',
                render: () => [
                    '🔒 深度安全检查',
                    '===============',
                    '',
                    `检查文件: ${filePath}`,
                    `绝对路径: ${absolutePath}`,
                    '',
                    '🔍 检查内容:',
                    ' • 代码注入漏洞 (eval, Function)',
                    ' • XSS攻击风险 (innerHTML, outerHTML)',
                    ' • 硬编码敏感信息',
                    ' • 命令注入风险',
                    ' • 路径遍历漏洞',
                    ' • 不安全的反序列化',
                    ' • 未验证的用户输入',
                    '',
                    '🛡️ 安全最佳实践:',
                    ' 1. 永远不要信任用户输入',
                    ' 2. 使用参数化查询/预处理语句',
                    ' 3. 实施输入验证和清理',
                    ' 4. 使用最小权限原则',
                    ' 5. 定期更新依赖包',
                    ' 6. 实施安全头部',
                    ' 7. 记录安全事件',
                    '',
                    '⚠️ 常见安全问题:',
                    ' • SQL注入 - 使用参数化查询',
                    ' • XSS攻击 - 转义用户输入',
                    ' • CSRF攻击 - 使用CSRF令牌',
                    ' • 文件上传漏洞 - 验证文件类型',
                    ' • 信息泄露 - 不要暴露敏感信息',
                    '',
                    '🔧 安全工具推荐:',
                    ' • ESLint安全插件',
                    ' • Snyk代码扫描',
                    ' • SonarQube安全检测',
                    ' • OWASP依赖检查',
                    ' • npm audit安全审计',
                    '',
                    '📚 安全资源:',
                    ' • OWASP Top 10',
                    ' • SANS安全清单',
                    ' • NIST安全框架',
                    ' • 公司安全策略',
                    '',
                    '💾 实际安全检查需要读取文件内容。'
                ].join('\n')
            };
        }
        // 生成报告
        if (command === 'report') {
            return {
                type: 'jsx',
                render: () => [
                    '📊 代码审查报告',
                    '===============',
                    '',
                    '报告功能可以生成详细的代码质量分析报告。',
                    '',
                    '📈 报告内容:',
                    ' • 项目概览和统计信息',
                    ' • 文件质量分布',
                    ' • 问题类型分析',
                    ' • 严重程度分布',
                    ' • 趋势分析 (如果有多份报告)',
                    ' • 改进建议和路线图',
                    '',
                    '📋 报告格式:',
                    ' • 文本摘要 - 快速查看关键信息',
                    ' • 详细报告 - 包含所有问题和建议',
                    ' • 可视化图表 - 质量分布和趋势',
                    ' • 导出格式 - JSON/HTML/PDF',
                    '',
                    '🎯 报告用途:',
                    ' 1. 团队代码质量评估',
                    ' 2. 项目健康度监控',
                    ' 3. 技术债务管理',
                    ' 4. 改进优先级排序',
                    ' 5. 合规性和审计',
                    '',
                    '🔧 生成步骤:',
                    ' 1. 收集代码库信息',
                    ' 2. 运行代码分析',
                    ' 3. 统计和分析结果',
                    ' 4. 生成报告文档',
                    ' 5. 分发和讨论',
                    '',
                    '💡 使用建议:',
                    ' • 定期生成报告 (每周/每月)',
                    ' • 与团队分享和讨论',
                    ' • 基于报告制定改进计划',
                    ' • 跟踪改进进度',
                    '',
                    '📝 示例报告结构:',
                    ' 1. 执行摘要',
                    ' 2. 项目概览',
                    ' 3. 质量分数分布',
                    ' 4. 问题详细分析',
                    ' 5. 改进建议',
                    ' 6. 行动计划',
                    '',
                    '💾 实际报告生成需要数据分析功能。'
                ].join('\n')
            };
        }
        // 查看统计
        if (command === 'stats') {
            return {
                type: 'jsx',
                render: () => [
                    '📈 代码审查统计',
                    '===============',
                    '',
                    '统计功能提供代码质量的量化分析。',
                    '',
                    '📊 统计指标:',
                    ' • 代码行数 (LOC)',
                    ' • 文件数量',
                    ' • 平均质量分数',
                    ' • 问题密度 (问题/千行)',
                    ' • 严重问题比例',
                    ' • 问题修复率',
                    ' • 代码重复率',
                    ' • 测试覆盖率',
                    '',
                    '📋 统计分类:',
                    ' • 按文件类型统计',
                    ' • 按目录统计',
                    ' • 按开发者统计',
                    ' • 按时间趋势统计',
                    ' • 按严重程度统计',
                    ' • 按问题类型统计',
                    '',
                    '📅 趋势分析:',
                    ' • 质量分数变化趋势',
                    ' • 问题数量变化趋势',
                    ' • 新问题引入速度',
                    ' • 问题修复速度',
                    ' • 技术债务积累',
                    '',
                    '🎯 统计用途:',
                    ' 1. 量化代码质量',
                    ' 2. 识别问题热点',
                    ' 3. 评估改进效果',
                    ' 4. 制定质量目标',
                    ' 5. 团队绩效评估',
                    '',
                    '🔧 统计方法:',
                    ' 1. 定期收集数据',
                    ' 2. 计算关键指标',
                    ' 3. 分析趋势和模式',
                    ' 4. 生成可视化图表',
                    ' 5. 制定改进策略',
                    '',
                    '💡 最佳实践:',
                    ' • 设置合理的质量目标',
                    ' • 关注趋势而非绝对值',
                    ' • 结合定性分析',
                    ' • 避免过度优化指标',
                    ' • 与业务价值结合',
                    '',
                    '📝 示例统计:',
                    ' • 项目: 100个文件, 10,000行代码',
                    ' • 平均质量分数: 78/100',
                    ' • 问题密度: 2.5问题/千行',
                    ' • 严重问题: 3个',
                    ' • 本周修复: 15个问题',
                    ' • 趋势: 质量分数提升5%',
                    '',
                    '💾 实际统计需要历史数据分析。'
                ].join('\n')
            };
        }
        // 生成修复建议
        if (command === 'fix') {
            return {
                type: 'jsx',
                render: () => [
                    '🔧 自动修复建议',
                    '===============',
                    '',
                    '修复功能提供自动化或半自动化的代码修复建议。',
                    '',
                    '🛠️ 修复能力:',
                    ' • 自动修复简单问题',
                    ' • 提供修复代码片段',
                    ' • 建议重构方案',
                    ' • 生成补丁文件',
                    ' • 集成IDE快速修复',
                    '',
                    '📋 支持修复的问题类型:',
                    ' • 简单的语法问题',
                    ' • 代码格式问题',
                    ' • 未使用的变量',
                    ' • 简单的安全修复',
                    ' • 最佳实践改进',
                    '',
                    '⚠️ 限制:',
                    ' • 无法修复复杂逻辑问题',
                    ' • 需要人工审查重要修复',
                    ' • 可能改变代码行为',
                    ' • 需要测试验证',
                    '',
                    '🔧 修复流程:',
                    ' 1. 分析问题并生成修复方案',
                    ' 2. 预览修复效果',
                    ' 3. 人工审查和确认',
                    ' 4. 应用修复',
                    ' 5. 运行测试验证',
                    '',
                    '💡 使用建议:',
                    ' • 从简单问题开始修复',
                    ' • 始终进行人工审查',
                    ' • 运行测试验证修复',
                    ' • 分批进行修复',
                    ' • 记录修复历史',
                    '',
                    '🚀 修复示例:',
                    ' 问题: 使用var声明变量',
                    ' 修复: 改为使用const或let',
                    '',
                    ' 问题: 空的异常处理',
                    ' 修复: 添加适当的错误处理',
                    '',
                    ' 问题: 调试代码残留',
                    ' 修复: 移除console.log语句',
                    '',
                    ' 问题: 魔法数字',
                    ' 修复: 提取为命名常量',
                    '',
                    '🔍 修复工具集成:',
                    ' • ESLint自动修复',
                    ' • Prettier代码格式化',
                    ' • TypeScript快速修复',
                    ' • IDE重构工具',
                    ' • 自定义修复脚本',
                    '',
                    '📚 修复资源:',
                    ' • 代码风格指南',
                    ' • 安全最佳实践',
                    ' • 性能优化指南',
                    ' • 重构模式',
                    '',
                    '💾 实际修复功能需要代码修改能力。'
                ].join('\n')
            };
        }
        // 未知命令
        return {
            type: 'jsx',
            render: () => `未知命令: ${command}\n使用 /code-review-assistant help 查看完整帮助。`
        };
    }
    catch (error) {
        return {
            type: 'jsx',
            render: () => [
                '❌ 代码审查出错',
                '',
                `错误: ${error instanceof Error ? error.message : String(error)}`,
                '',
                '💡 排查建议:',
                ' 1. 检查命令语法是否正确',
                ' 2. 确认文件路径是否存在',
                ' 3. 检查文件读取权限',
                ' 4. 查看详细错误日志',
                '',
                '🔧 技术支持:',
                ' 如果问题持续存在，请提供:',
                ' • 具体的命令和参数',
                ' • 文件路径和内容',
                ' • 错误堆栈信息',
                ' • 操作系统和环境信息'
            ].join('\n')
        };
    }
};
