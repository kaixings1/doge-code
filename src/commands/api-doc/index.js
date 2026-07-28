import fs from 'fs';
import path from 'path';
export const call = async (args) => {
    const p = args.trim().split(/\s+/);
    const c = p[0] || '';
    if (!c)
        return { type: 'text', value: '/api-doc gen <file.ts> | 从代码生成 API 文档\n/api-doc scan <dir> | 扫描目录中的 API\n/api-doc openapi <file> | 解析 OpenAPI 规范' };
    let r = '';
    if (c === 'gen') {
        const file = p[1];
        if (!file || !fs.existsSync(file))
            return { type: 'text', value: '文件不存在: ' + (file || '') };
        const content = fs.readFileSync(file, 'utf-8');
        const lines = content.split('\n');
        const apis = [];
        let currentComment = '';
        for (const line of lines) {
            if (line.trim().startsWith('/**'))
                currentComment = '';
            else if (line.trim().startsWith('*'))
                currentComment += line.trim().replace(/^\s*\*\s?/, ' ') + '\n';
            else if (line.includes('function') || line.includes('=>') || line.includes('export')) {
                const match = line.match(/export\s+(async\s+)?function\s+(\w+)|(\w+)\s*[:=]\s*(async\s+)?\(/);
                if (match) {
                    const name = match[2] || match[3] || 'anonymous';
                    apis.push('## ' + name + '\n' + (currentComment.trim() || '*无描述*') + '\n```\n' + line.trim() + '\n```\n');
                }
                currentComment = '';
            }
        }
        r = '# API 文档: ' + path.basename(file) + '\n\n' + (apis.join('\n') || '(未找到API)');
    }
    else if (c === 'scan') {
        const dir = p[1] || '.';
        if (!fs.existsSync(dir))
            return { type: 'text', value: '目录不存在: ' + dir };
        const results = [];
        function walk(d) {
            try {
                for (const item of fs.readdirSync(d, { withFileTypes: true })) {
                    const full = path.join(d, item.name);
                    if (item.isFile() && /\.(ts|tsx|js|jsx)$/i.test(item.name)) {
                        const content = fs.readFileSync(full, 'utf-8');
                        const exports = content.match(/export\s+(async\s+)?(function|const|class|interface|type)\s+(\w+)/g);
                        if (exports)
                            results.push(full + ': ' + exports.length + ' 个导出');
                    }
                }
            }
            catch { }
        }
        walk(dir);
        r = results.join('\n') || '(未找到文件)';
    }
    else {
        r = '未知: ' + c;
    }
    return { type: 'text', value: r || '(无输出)' };
};
const cmd = { type: 'local-jsx', name: 'api-doc', description: 'API 文档生成器：gen/scan', argumentHint: '<gen|scan> <file|dir>', isEnabled: () => true, load: () => import('./index.js') };
export default cmd;
//# sourceMappingURL=index.js.map