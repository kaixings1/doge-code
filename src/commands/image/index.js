import fs from 'fs';
import path from 'path';
export const call = async (args) => {
    const p = args.trim().split(/\s+/);
    const c = p[0] || '';
    if (!c)
        return { type: 'text', value: '/image info <file> | 图片基本信息\n/image resize <file> <w> <h> | 调整大小\n/image convert <file> <format> | 格式转换\n/image ls <dir> | 列出图片文件' };
    const file = p[1];
    let r = '';
    if (c === 'ls') {
        const dir = file || '.';
        try {
            const files = fs.readdirSync(dir).filter(f => /\.(png|jpg|jpeg|gif|svg|webp|bmp|ico)$/i.test(f));
            r = files.map(f => path.join(dir, f)).join('\n') || '(无图片)';
        }
        catch (e) {
            r = '错误: ' + e.message;
        }
    }
    else if (c === 'info') {
        if (!file || !fs.existsSync(file))
            return { type: 'text', value: '文件不存在: ' + (file || '') };
        const stat = fs.statSync(file);
        const ext = path.extname(file).toLowerCase();
        r = '文件: ' + file + '\n类型: ' + ext + '\n大小: ' + (stat.size / 1024).toFixed(1) + ' KB';
    }
    else if (c === 'convert') {
        const fmt = p[2] || 'png';
        if (!file || !fs.existsSync(file))
            return { type: 'text', value: '文件不存在' };
        const out = file.replace(/\.[^.]+$/, '') + '.' + fmt;
        const { execSync } = await import('child_process');
        try {
            execSync('magick convert "' + file + '" "' + out + '"', { timeout: 30000 });
            r = '已转换为: ' + out;
        }
        catch {
            r = 'ImageMagick 未安装。尝试: /image info ' + file;
        }
    }
    else {
        r = '未知: ' + c;
    }
    return { type: 'text', value: r || '(无输出)' };
};
const cmd = { type: 'local-jsx', name: 'image', description: '图片信息查看与管理：info/ls/convert', argumentHint: '<info|ls|convert> [args]', isEnabled: () => true, load: () => import('./index.js') };
export default cmd;
//# sourceMappingURL=index.js.map