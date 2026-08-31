import { call } from './fileWatcher.js';
const fileWatcher = {
    type: 'local',
    name: 'file-watcher',
    description: '监听文件变化并执行相应操作',
    argumentHint: '<文件路径>',
    load: () => Promise.resolve({ call: call }),
};
export default fileWatcher;
