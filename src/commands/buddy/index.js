import { isBuddyLive } from '../../buddy/useBuddyNotification.js';
const buddy = {
    type: 'local-jsx',
    name: 'buddy',
    description: '孵化编程伙伴 · pet 抚摸, off 静音',
    argumentHint: '[pet|off]',
    immediate: true,
    get isHidden() {
        return !isBuddyLive();
    },
    load: () => import('./buddy.ts'),
};
export default buddy;
