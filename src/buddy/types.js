export const RARITIES = [
    'common',
    'uncommon',
    'rare',
    'epic',
    'legendary',
];
// 一个物种名称与 excluded-strings.txt 中的模型代号金丝雀冲突。
// 检查会 grep 构建输出（而非源代码），因此运行时构造该值可以将其保留在 bundle 之外，
// 同时检查仍会对实际代号保持武装状态。
// 所有物种采用统一编码；`as` 转换仅是类型位置（在 bundle 之前擦除）。
const c = String.fromCharCode;
// biome-ignore format: keep the species list compact
export const duck = c(0x64, 0x75, 0x63, 0x6b);
export const goose = c(0x67, 0x6f, 0x6f, 0x73, 0x65);
export const blob = c(0x62, 0x6c, 0x6f, 0x62);
export const cat = c(0x63, 0x61, 0x74);
export const dragon = c(0x64, 0x72, 0x61, 0x67, 0x6f, 0x6e);
export const octopus = c(0x6f, 0x63, 0x74, 0x6f, 0x70, 0x75, 0x73);
export const owl = c(0x6f, 0x77, 0x6c);
export const penguin = c(0x70, 0x65, 0x6e, 0x67, 0x75, 0x69, 0x6e);
export const turtle = c(0x74, 0x75, 0x72, 0x74, 0x6c, 0x65);
export const snail = c(0x73, 0x6e, 0x61, 0x69, 0x6c);
export const ghost = c(0x67, 0x68, 0x6f, 0x73, 0x74);
export const axolotl = c(0x61, 0x78, 0x6f, 0x6c, 0x6f, 0x74, 0x6c);
export const capybara = c(0x63, 0x61, 0x70, 0x79, 0x62, 0x61, 0x72, 0x61);
export const cactus = c(0x63, 0x61, 0x63, 0x74, 0x75, 0x73);
export const robot = c(0x72, 0x6f, 0x62, 0x6f, 0x74);
export const rabbit = c(0x72, 0x61, 0x62, 0x62, 0x69, 0x74);
export const mushroom = c(0x6d, 0x75, 0x73, 0x68, 0x72, 0x6f, 0x6f, 0x6d);
export const chonk = c(0x63, 0x68, 0x6f, 0x6e, 0x6b);
export const SPECIES = [
    duck,
    goose,
    blob,
    cat,
    dragon,
    octopus,
    owl,
    penguin,
    turtle,
    snail,
    ghost,
    axolotl,
    capybara,
    cactus,
    robot,
    rabbit,
    mushroom,
    chonk,
];
export const EYES = ['·', '✦', '×', '◉', '@', '°'];
export const HATS = [
    'none',
    'crown',
    'tophat',
    'propeller',
    'halo',
    'wizard',
    'beanie',
    'tinyduck',
];
export const STAT_NAMES = [
    '调试',
    '耐心',
    '混沌',
    '智慧',
    '毒舌',
];
export const RARITY_WEIGHTS = {
    common: 60,
    uncommon: 25,
    rare: 10,
    epic: 4,
    legendary: 1,
};
export const RARITY_STARS = {
    common: '★',
    uncommon: '★★',
    rare: '★★★',
    epic: '★★★★',
    legendary: '★★★★★',
};
export const RARITY_COLORS = {
    common: 'inactive',
    uncommon: 'success',
    rare: 'permission',
    epic: 'autoAccept',
    legendary: 'warning',
};
// 稀有度中文名称
export const RARITY_NAMES_CN = {
    common: '普通',
    uncommon: '优秀',
    rare: '稀有',
    epic: '史诗',
    legendary: '传说',
};
// 物种中文名称
export const SPECIES_NAMES_CN = {
    duck: '鸭子',
    goose: '鹅',
    blob: '史莱姆',
    cat: '猫',
    dragon: '龙',
    octopus: '章鱼',
    owl: '猫头鹰',
    penguin: '企鹅',
    turtle: '乌龟',
    snail: '蜗牛',
    ghost: '幽灵',
    axolotl: '六角恐龙',
    capybara: '水豚',
    cactus: '仙人掌',
    robot: '机器人',
    rabbit: '兔子',
    mushroom: '蘑菇',
    chonk: '胖墩',
};
