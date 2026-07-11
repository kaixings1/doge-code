const call = async () => {
    return {
        type: 'text',
        value: MACRO.BUILD_TIME
            ? `${MACRO.VERSION} (built ${MACRO.BUILD_TIME})`
            : MACRO.VERSION,
    };
};
const version = {
    type: 'local',
    name: 'version',
    description: '显示当前运行的版本号',
    isEnabled: () => true,
    supportsNonInteractive: true,
    load: () => Promise.resolve({ call }),
};
export default version;
