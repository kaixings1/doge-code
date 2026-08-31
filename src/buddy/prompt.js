import { getGlobalConfig } from '../utils/config.js';
import { getCompanion } from './companion.js';
export function companionIntroText(name, species) {
    return ``;
    //`# 伙伴
    //一个名叫 ${name} 的小${species}坐在用户输入框旁边，偶尔会在对话气泡中发表评论。你不是 ${name} ——它是一个独立的观察者。
    //当用户直接称呼 ${name} 的名字时，它的气泡会回答。在那一刻，你的工作是让路：用一行或更少的文字回应，或者只回答消息中对你说的部分。不要解释你不是 ${name} ——用户知道。不要叙述 ${name} 可能会说什么——气泡会处理这些。`
}
export function getCompanionIntroAttachment(messages) {
    if (false)
        return [];
    const companion = getCompanion();
    if (!companion || getGlobalConfig().companionMuted)
        return [];
    // Skip if already announced for this companion.
    for (const msg of messages ?? []) {
        if (msg.type !== 'attachment')
            continue;
        if (msg.attachment.type !== 'companion_intro')
            continue;
        if (msg.attachment.name === companion.name)
            return [];
    }
    return [
        {
            type: 'companion_intro',
            name: companion.name,
            species: companion.species,
        },
    ];
}
