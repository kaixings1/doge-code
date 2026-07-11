import { execSync } from 'child_process';
export const call = async (args) => {
    const p = args.trim().split(/\s+/);
    const c = p[0] || '';
    if (!c)
        return { type: 'text', value: '/deploy ssh <host> <cmd> | SSH 执行命令\n/deploy scp <src> <host>:<dest> | SCP 上传文件\n/deploy pm2 list | PM2 进程列表\n/deploy pm2 restart <name> | PM2 重启\n/deploy pm2 logs <name> | PM2 日志' };
    let r = '';
    if (c === 'ssh') {
        const host = p[1];
        const cmd = p.slice(2).join(' ');
        if (!host || !cmd)
            return { type: 'text', value: '用法: /deploy ssh <host> <command>' };
        try {
            r = execSync('ssh ' + host + ' ' + cmd, { encoding: 'utf-8', timeout: 30000 }).trim();
        }
        catch (e) {
            r = '错误: ' + e.message;
        }
    }
    else if (c === 'scp') {
        if (!p[1] || !p[2])
            return { type: 'text', value: '用法: /deploy scp <src> <host>:<dest>' };
        try {
            r = execSync('scp ' + p[1] + ' ' + p[2], { encoding: 'utf-8', timeout: 60000 }).trim();
        }
        catch (e) {
            r = '错误: ' + e.message;
        }
    }
    else if (c === 'pm2') {
        const sub = p[1] || 'list';
        try {
            r = execSync('pm2 ' + sub + ' ' + p.slice(2).join(' '), { encoding: 'utf-8', timeout: 15000 }).trim();
        }
        catch (e) {
            r = '错误: ' + e.message;
        }
    }
    else {
        r = '未知: ' + c;
    }
    return { type: 'text', value: r || '(无输出)' };
};
const cmd = { type: 'local-jsx', name: 'deploy', description: '部署工具：ssh/scp/pm2 管理', argumentHint: '<ssh|scp|pm2> [args]', isEnabled: () => true, load: () => import('./index.js') };
export default cmd;
