import { describe, expect, it } from 'vitest'
import { isInitialSkillListing } from '../../src/utils/attachments.js'

/**
 * isInitialSkillListing 的判据测试。
 *
 * 背景：UI 侧 AttachmentMessage 对 skill_listing 的 isInitial 直接 return null
 * （不渲染）。因此一旦把「被关键词过滤缩水后的增量批次」误判为 initial，
 * 用户就看不到技能列表；反之把真正的全量首次注入判为非 initial，
 * 则会在对话里多显示一条本不该出现的横幅。
 *
 * 历史缺陷：原判据为 `sent.size === 0 && newSkills.length === allCommands.length`。
 * newSkills 恒为 allCommands 的子集，该等号在「已过滤」场景下退化为恒等式，
 * 无法区分两种批次 —— 判据形同虚设。
 */
describe('isInitialSkillListing', () => {
  it('全量首次注入（sent 为空、过滤前后数量一致）判为 initial', () => {
    expect(isInitialSkillListing(0, 42, 42)).toBe(true)
  })

  it('被关键词过滤缩水后，即便 sent 为空也不判为 initial', () => {
    // /clear 后 resetSentSkillNames 清空 sent → sentCount=0，
    // 但本轮 allCommands 从 42 缩到 7，不是全量，不该是初始批次。
    expect(isInitialSkillListing(0, 42, 7)).toBe(false)
  })

  it('进程内已发过技能时不判为 initial', () => {
    expect(isInitialSkillListing(42, 42, 42)).toBe(false)
  })

  it('无可发内容时不判为 initial（避免渲染空列表）', () => {
    expect(isInitialSkillListing(0, 0, 0)).toBe(false)
  })

  // 变异测试：确认判据真的在做「过滤前后数量比较」，
  // 而非退化成只判 sentCount。若实现改回 newSkills.length === allCommands.length
  // 的等价形式（忽略 totalBeforeFilter），下面第 2 条用例必须失败。
  it('变异探针：totalBeforeFilter 参与判据（忽略它则应失真）', () => {
    // 同一 sentCount=0、同一过滤后数量 7，仅过滤前数量不同 → 结果必须不同。
    // 若实现忽略 totalBeforeFilter，两者会得到相同结果，此断言即失败。
    expect(isInitialSkillListing(0, 7, 7)).toBe(true)
    expect(isInitialSkillListing(0, 42, 7)).toBe(false)
  })
})
