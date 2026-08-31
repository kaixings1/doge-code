import { execSync } from 'child_process';
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
        return { output: `redis — Redis 缓存操作：get/set/del/keys/ping/info/flush\n用法: /redis`.trim(), truncated: false };
    }
    const p = args.trim().split(/\s+/);
    const c = p[0] || '';
    if (!c)
        return { type: 'text', value: '📖 用法:\n/redis get <key> | 获取值\n/redis set <key> <value> | 设置值\n/redis del <key> | 删�键\n/redis keys <pattern> | 搜索键\n/redis ping | 测试连接\n/redis info | 服务器信息\n/redis flush | 清空数据库' };
    let r = '';
    const redisCmd = 'redis-cli';
    if (c === 'get') {
        r = run(redisCmd + ' GET ' + (p[1] || ''));
    }
    else if (c === 'set') {
        r = run(redisCmd + ' SET ' + p[1] + ' ' + p.slice(2).join(' '));
    }
    else if (c === 'del') {
        r = run(redisCmd + ' DEL ' + (p[1] || ''));
    }
    else if (c === 'keys') {
        r = run(redisCmd + ' KEYS "' + (p[1] || '*') + '"');
    }
    else if (c === 'ping') {
        r = run(redisCmd + ' PING');
    }
    else if (c === 'info') {
        r = run(redisCmd + ' INFO');
    }
    else if (c === 'flush') {
        r = run(redisCmd + ' FLUSHDB');
    }
    else {
        r = '未知: ' + c;
    }
    return { type: 'text', value: r || '(无输出)' };
};
const cmd = { type: 'local-jsx', name: 'redis', description: 'Redis 缓存操作：get/set/del/keys/ping/info/flush', argumentHint: '<get|set|del|keys|ping|info|flush> [args]', isEnabled: () => true, load: () => import('./index.ts') };
export default cmd;
