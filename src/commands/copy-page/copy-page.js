export async function call(onDone, args) {
    const content = args?.trim() || '请在此粘贴你想要格式化为 Markdown 的内容。';
    // 简单的 Markdown 格式化
    const formatted = content
        .replace(/\n/g, '\n')
        .split('\n')
        .map(line => line.trim())
        .join('\n\n');
    onDone(`以下内容已格式化为 Markdown：

\`\`\`markdown
${formatted}
\`\`\`

你可以复制上述内容。`, { display: 'system' });
}
//# sourceMappingURL=copy-page.js.map