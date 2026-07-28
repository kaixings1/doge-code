import { memoize } from '../../vendor/lodash.js';
import { getAPIProvider } from './providers.js';
const TIERS = [
    {
        modelEnvVar: 'ANTHROPIC_DEFAULT_OPUS_MODEL',
        capabilitiesEnvVar: 'ANTHROPIC_DEFAULT_OPUS_MODEL_SUPPORTED_CAPABILITIES',
    },
    {
        modelEnvVar: 'ANTHROPIC_DEFAULT_SONNET_MODEL',
        capabilitiesEnvVar: 'ANTHROPIC_DEFAULT_SONNET_MODEL_SUPPORTED_CAPABILITIES',
    },
    {
        modelEnvVar: 'ANTHROPIC_DEFAULT_HAIKU_MODEL',
        capabilitiesEnvVar: 'ANTHROPIC_DEFAULT_HAIKU_MODEL_SUPPORTED_CAPABILITIES',
    },
];
/**
 * 检查是否对匹配 ANTHROPIC_DEFAULT_*_MODEL 固定环境变量的模型设置了第三方模型能力覆盖。
 */
export const get3PModelCapabilityOverride = memoize((model, capability) => {
    if (getAPIProvider() === 'firstParty') {
        return undefined;
    }
    const m = model.toLowerCase();
    for (const tier of TIERS) {
        const pinned = process.env[tier.modelEnvVar];
        const capabilities = process.env[tier.capabilitiesEnvVar];
        if (!pinned || capabilities === undefined)
            continue;
        if (m !== pinned.toLowerCase())
            continue;
        return capabilities
            .toLowerCase()
            .split(',')
            .map(s => s.trim())
            .includes(capability);
    }
    return undefined;
}, (model, capability) => `${model.toLowerCase()}:${capability}`);
//# sourceMappingURL=modelSupportOverrides.js.map