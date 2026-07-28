const backup = {
    type: 'local',
    name: 'backup',
    description: '备份当前会话数据到本地文件',
    load: () => import('./backup.js'),
};
export default backup;
//# sourceMappingURL=index.js.map