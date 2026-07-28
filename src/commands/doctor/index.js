import { isEnvTruthy } from '../../utils/envUtils.js';
const doctor = {
    name: 'doctor',
    description: '诊断并验证您的 Claude Code 安装和设置',
    isEnabled: () => !isEnvTruthy(process.env.DISABLE_DOCTOR_COMMAND),
    type: 'local-jsx',
    load: () => import('./doctor.js'),
};
export default doctor;
//# sourceMappingURL=index.js.map