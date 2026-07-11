import { execSync } from 'child_process';
function run(cmd) {
    try {
        return execSync(cmd, { encoding: 'utf-8', timeout: 30000 }).trim();
    }
    catch (e) {
        return '错误: ' + e.message;
    }
}
export const call = async (args) => {
    const p = args.trim().split(/\s+/);
    const c = p[0] || '';
    if (!c)
        return { type: 'text', value: '/k8s pods | pods\n/k8s deploy | deployments\n/k8s svc | services\n/k8s get <type> | get resources\n/k8s describe <t> <n> | describe\n/k8s logs <pod> | logs' };
    let r = '';
    if (c === 'pods') {
        r = run('kubectl get pods');
    }
    else if (c === 'deploy') {
        r = run('kubectl get deployments');
    }
    else if (c === 'svc') {
        r = run('kubectl get services');
    }
    else if (c === 'get') {
        r = run('kubectl get ' + (p[1] || 'pods'));
    }
    else if (c === 'describe') {
        r = run('kubectl describe ' + (p[1] || 'pod') + ' ' + (p[2] || ''));
    }
    else if (c === 'logs') {
        r = run('kubectl logs --tail=50 ' + (p[1] || ''));
    }
    else {
        r = '未知: ' + c;
    }
    return { type: 'text', value: r || '(无输出)' };
};
const cmd = { type: 'local-jsx', name: 'k8s', description: 'Kubernetes 集群管理：pods/deploy/svc/get/describe/logs', argumentHint: '<pods|deploy|svc|get|describe|logs>', isEnabled: () => true, load: () => import('./index.js') };
export default cmd;
