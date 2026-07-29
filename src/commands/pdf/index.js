import fs from 'fs';
export const call = async (args) => {
    const p = args.trim().split(/\s+/);
    const c = p[0] || '';
    if (!c)
        return { type: 'text', value: '/pdf read <file> | 读取 PDF 文本内容\n/pdf info <file> | PDF 基本信息\n/pdf images <file> | 提取图片信息' };
    const file = p[1];
    if (!file || !fs.existsSync(file))
        return { type: 'text', value: '文件不存在: ' + (file || '') };
    let r = '';
    if (c === 'read') {
        try {
            const data = fs.readFileSync(file);
            const text = data.toString('utf-8').replace(/[^\x20-\x7E\u4e00-\u9fa5\n]/g, ' ').replace(/\s+/g, ' ').trim();
            r = text.slice(0, 5000) + (text.length > 5000 ? '\n...(已截断)' : '');
        }
        catch (e) {
            r = '读取 PDF 出错: ' + e.message;
        }
    }
    else if (c === 'info') {
        const stat = fs.statSync(file);
        r = '文件: ' + file + '\n大小: ' + (stat.size / 1024).toFixed(1) + ' KB\n修改时间: ' + stat.mtime.toISOString();
    }
    else {
        r = '未知: ' + c;
    }
    return { type: 'text', value: r || '(无内容)' };
};
const cmd = { type: 'local-jsx', name: 'pdf', description: 'PDF 文件读取与信息查看：read/info', argumentHint: '<read|info> <file>', isEnabled: () => true, load: () => import('./index.ts') };
export default cmd;
//# sourceMappingURL=index.js.map