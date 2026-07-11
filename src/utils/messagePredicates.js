// tool_result messages share type:'user' with human turns; the discriminant
// is the optional toolUseResult field. Four PRs (#23977, #24016, #24022,
// #24025) independently fixed miscounts from checking type==='user' alone.
export function isHumanTurn(m) {
    return m.type === 'user' && !m.isMeta && m.toolUseResult === undefined;
}
