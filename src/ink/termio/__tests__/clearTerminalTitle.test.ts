import { describe, it, expect } from 'vitest'
import { CLEAR_TERMINAL_TITLE, OSC_PREFIX } from '../osc.js'
import { BEL } from '../ansi.js'

// OSC 0 title-clear must be a *well-formed* sequence so every terminal parser
// actually resets the tab title on exit. A bare `ESC ] 0 ; BEL` (no title
// field) is malformed and gets dropped by strict parsers — leaving a stale
// "[空闲] …" on the tab after the session ends.
describe('CLEAR_TERMINAL_TITLE', () => {
  it('is a well-formed OSC 0 with an empty title field', () => {
    // ESC ] 0 ; <empty> BEL — note the empty title between the two `;`
    // and the BEL terminator.
    const expected = `${OSC_PREFIX}0;;${BEL}`
    expect(CLEAR_TERMINAL_TITLE).toBe(expected)
  })

  it('starts with the OSC introducer', () => {
    expect(CLEAR_TERMINAL_TITLE.startsWith(OSC_PREFIX)).toBe(true)
  })

  it('uses command 0 (set title and icon)', () => {
    expect(CLEAR_TERMINAL_TITLE).toContain(`${OSC_PREFIX}0;`)
  })

  it('has an explicit empty title between two semicolons', () => {
    // The first `;` opens the title field, the second `;` closes it (empty).
    expect(CLEAR_TERMINAL_TITLE).toContain(';;')
  })

  it('is terminated by BEL', () => {
    expect(CLEAR_TERMINAL_TITLE.endsWith(BEL)).toBe(true)
  })

  it('does not omit the title (regression: bare ESC ] 0 ; BEL)', () => {
    // The buggy form would have been `ESC ] 0 ; BEL` with no trailing `;`.
    const buggy = `${OSC_PREFIX}0;${BEL}`
    expect(CLEAR_TERMINAL_TITLE).not.toBe(buggy)
  })
})
