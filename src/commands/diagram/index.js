import fs from 'fs';
export const call = async (args) => {
    const p = args.trim().split(/\s+/);
    const c = p[0] || '';
    if (!c)
        return { type: 'text', value: '/diagram mermaid <file> | 渲染 Mermaid 图表\n/diagram template <type> | 生成图表模板\ntypes: flowchart, sequence, class, state, gantt' };
    let r = '';
    if (c === 'template') {
        const type = p[1] || 'flowchart';
        const templates = {
            flowchart: 'graph TD\nA[Start] --> B{Decision}\nB -->|Yes| C[Process]\nB -->|No| D[End]',
            sequence: 'sequenceDiagram\nAlice->>John: Hello John\nJohn-->>Alice: Hi Alice',
            class: 'classDiagram\nclass Animal {\n+String name\n+makeSound()\n}',
            state: 'stateDiagram-v2\n[*] --> Still\nStill --> Moving\nMoving --> Still\nMoving --> [*]',
            gantt: 'gantt\ntitle Project Plan\nsection Phase 1\nTask 1 :a1, 2024-01-01, 30d',
        };
        r = templates[type] || '未知类型: ' + type;
    }
    else if (c === 'mermaid') {
        const file = p[1];
        if (!file || !fs.existsSync(file))
            return { type: 'text', value: '文件不存在: ' + (file || '') };
        r = fs.readFileSync(file, 'utf-8');
    }
    else {
        r = '未知: ' + c;
    }
    return { type: 'text', value: r || '(无输出)' };
};
const cmd = { type: 'local-jsx', name: 'diagram', description: 'Mermaid 图表模板生成：template/mermaid', argumentHint: '<template|mermaid> [type|file]', isEnabled: () => true, load: () => import('./index.ts') };
export default cmd;
//# sourceMappingURL=index.js.map