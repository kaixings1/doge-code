import { memoize } from './vendor/lodash.js';
import { join } from 'path';
import { getCurrentProjectConfig, saveCurrentProjectConfig, } from './utils/config.js';
import { getCwd } from './utils/cwd.js';
import { isDirEmpty } from './utils/file.js';
import { getFsImplementation } from './utils/fsOperations.js';
export function getSteps() {
    const hasClaudeMd = getFsImplementation().existsSync(join(getCwd(), 'CLAUDE.md'));
    const isWorkspaceDirEmpty = isDirEmpty(getCwd());
    return [
        {
            key: 'workspace',
            text: '让 Claude 创建新应用或克隆仓库',
            isComplete: false,
            isCompletable: true,
            isEnabled: isWorkspaceDirEmpty,
        },
        {
            key: 'claudemd',
            text: '运行 /init 创建包含 Claude 指令的 CLAUDE.md 文件',
            isComplete: hasClaudeMd,
            isCompletable: true,
            isEnabled: !isWorkspaceDirEmpty,
        },
    ];
}
export function isProjectOnboardingComplete() {
    return getSteps()
        .filter(({ isCompletable, isEnabled }) => isCompletable && isEnabled)
        .every(({ isComplete }) => isComplete);
}
export function maybeMarkProjectOnboardingComplete() {
    // Short-circuit on cached config — isProjectOnboardingComplete() hits
    // the filesystem, and REPL.tsx calls this on every prompt submit.
    if (getCurrentProjectConfig().hasCompletedProjectOnboarding) {
        return;
    }
    if (isProjectOnboardingComplete()) {
        saveCurrentProjectConfig(current => ({
            ...current,
            hasCompletedProjectOnboarding: true,
        }));
    }
}
export const shouldShowProjectOnboarding = memoize(() => {
    const projectConfig = getCurrentProjectConfig();
    // Short-circuit on cached config before isProjectOnboardingComplete()
    // hits the filesystem — this runs during first render.
    if (projectConfig.hasCompletedProjectOnboarding ||
        projectConfig.projectOnboardingSeenCount >= 4 ||
        process.env.IS_DEMO) {
        return false;
    }
    return !isProjectOnboardingComplete();
});
export function incrementProjectOnboardingSeenCount() {
    saveCurrentProjectConfig(current => ({
        ...current,
        projectOnboardingSeenCount: current.projectOnboardingSeenCount + 1,
    }));
}
//# sourceMappingURL=projectOnboardingState.js.map