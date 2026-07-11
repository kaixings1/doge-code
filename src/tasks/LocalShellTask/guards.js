// Pure type + type guard for LocalShellTask state.
// Extracted from LocalShellTask.tsx so non-React consumers (stopTask.ts via
// print.ts) don't pull React/ink into the module graph.
export function isLocalShellTask(task) {
    return (typeof task === 'object' &&
        task !== null &&
        'type' in task &&
        task.type === 'local_bash');
}
