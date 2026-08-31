import { execSync } from 'child_process';
import fs from 'fs';
function run(cmd) {
    try {
        return execSync(cmd, { encoding: 'utf-8', timeout: 10000 }).trim();
    }
    catch (e) {
        return '❌ 错误: ' + e.message;
    }
}
export const call = async (args) => {
    if ((args || '').trim() === 'help' || (args || '').trim() === '--help' || (args || '').trim() === '-h') {
        return { output: `nginx — Nginx 管理：status/start/stop/reload/test/sites/logs/config\n用法: /nginx`.trim(), truncated: false };
    }
    const p = args.trim().split(/\s+/);
    const c = p[0] || '';
    if (!c)
        return { type: 'text', value: '❌ 错误: /nginx status | Nginx 状态\n/nginx start | 启动\n/nginx stop | 停止\n/nginx reload | 重载配置\n/nginx test | 测试配置\n/nginx sites | 列出站点\n/nginx logs | 错误日志\n/nginx config <file> | 显示配置' };
    let r = '';
    if (c === 'status') {
        r = run('nginx -t 2>&1; echo ---; netstat -ano | findstr :80 || ss -tlnp | grep 80');
    }
    else if (c === 'start') {
        r = run('nginx');
    }
    else if (c === 'stop') {
        r = run('nginx -s stop');
    }
    else if (c === 'reload') {
        r = run('nginx -s reload');
    }
    else if (c === 'test') {
        r = run('nginx -t 2>&1');
    }
    else if (c === 'sites') {
        const dirs = ['/etc/nginx/sites-enabled', '/etc/nginx/conf.d', '/usr/local/etc/nginx/sites'];
        for (const d of dirs) {
            if (fs.existsSync(d)) {
                try {
                    r += d + ':\n' + fs.readdirSync(d).join('\n') + '\n\n';
                }
                catch { }
            }
        }
        r = r || '(未找到站点目录)';
    }
    else if (c === 'logs') {
        r = run('tail -50 /var/log/nginx/error.log 2>/dev/null || echo "未找到日志文件"');
    }
    else if (c === 'config') {
        const file = p[1] || '/etc/nginx/nginx.conf';
        r = fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : '文件不存在: ' + file;
    }
    else {
        r = '未知: ' + c;
    }
    return { type: 'text', value: r || '(无输出)' };
};
const cmd = { type: 'local-jsx', name: 'nginx', description: 'Nginx 管理：status/start/stop/reload/test/sites/logs/config', argumentHint: '<status|start|stop|reload|test|sites|logs|config> [args]', isEnabled: () => true, load: () => import('./index.ts') };
export default cmd;
