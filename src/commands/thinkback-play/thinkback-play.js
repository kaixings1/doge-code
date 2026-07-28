import { join } from 'path';
import { loadInstalledPluginsV2 } from '../../utils/plugins/installedPluginsManager.js';
import { OFFICIAL_MARKETPLACE_NAME } from '../../utils/plugins/officialMarketplace.js';
import { playAnimation } from '../thinkback/thinkback.js';
const INTERNAL_MARKETPLACE_NAME = 'claude-code-marketplace';
const SKILL_NAME = 'thinkback';
function getPluginId() {
    const marketplaceName = process.env.USER_TYPE === 'ant'
        ? INTERNAL_MARKETPLACE_NAME
        : OFFICIAL_MARKETPLACE_NAME;
    return `thinkback@${marketplaceName}`;
}
export async function call() {
    // Get skill directory from installed plugins config
    const v2Data = loadInstalledPluginsV2();
    const pluginId = getPluginId();
    const installations = v2Data.plugins[pluginId];
    if (!installations || installations.length === 0) {
        return {
            type: 'text',
            value: 'Thinkback 插件未安装。请先运行 /think-back 进行安装。',
        };
    }
    const firstInstall = installations[0];
    if (!firstInstall?.installPath) {
        return {
            type: 'text',
            value: '找不到 Thinkback 插件安装路径。',
        };
    }
    const skillDir = join(firstInstall.installPath, 'skills', SKILL_NAME);
    const result = await playAnimation(skillDir);
    return { type: 'text', value: result.message };
}
//# sourceMappingURL=thinkback-play.js.map