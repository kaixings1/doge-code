import { describe, it, expect } from 'vitest'
import {
  OSC_PREFIX,
  ST,
  programStatus,
  CLEAR_PROGRAM_STATUS,
  PROGRAM_STATUS,
  wrapForMultiplexer,
} from '../osc.js'
import { BEL, ESC } from '../ansi.js'

// OSC 7501 Program Status Protocol: `ESC ] 7501 ; <state> BEL`.
// Terminals that implement it show whether the session is working, waiting on
// the user, or done. The sequence must be well-formed and use command 7501 so
// that implementing terminals parse it and others silently discard it.
describe('programStatus (OSC 7501)', () => {
  it('uses command 7501', () => {
    expect(PROGRAM_STATUS).toBe(7501)
  })

  it('emits busy as ESC ] 7501 ; busy BEL', () => {
    const expected = `${OSC_PREFIX}${PROGRAM_STATUS};busy${BEL}`
    expect(programStatus('busy')).toBe(expected)
  })

  it('emits idle as ESC ] 7501 ; idle BEL', () => {
    const expected = `${OSC_PREFIX}${PROGRAM_STATUS};idle${BEL}`
    expect(programStatus('idle')).toBe(expected)
  })

  it('emits waiting as ESC ] 7501 ; waiting BEL', () => {
    const expected = `${OSC_PREFIX}${PROGRAM_STATUS};waiting${BEL}`
    expect(programStatus('waiting')).toBe(expected)
  })

  it('emits done as ESC ] 7501 ; done BEL', () => {
    const expected = `${OSC_PREFIX}${PROGRAM_STATUS};done${BEL}`
    expect(programStatus('done')).toBe(expected)
  })

  it('terminates with BEL', () => {
    expect(programStatus('busy').endsWith(BEL)).toBe(true)
  })

  it('does not collide with OSC 21337 tab-status command', () => {
    // Regression: the prefix must use 7501, never 21337.
    expect(programStatus('busy')).toContain(`${OSC_PREFIX}7501;`)
    expect(programStatus('busy')).not.toContain(`${OSC_PREFIX}21337;`)
  })
})

describe('CLEAR_PROGRAM_STATUS (OSC 7501)', () => {
  it('is a well-formed empty-state sequence ESC ] 7501 ; BEL', () => {
    const expected = `${OSC_PREFIX}${PROGRAM_STATUS};${BEL}`
    expect(CLEAR_PROGRAM_STATUS).toBe(expected)
  })

  it('is terminated by BEL', () => {
    expect(CLEAR_PROGRAM_STATUS.endsWith(BEL)).toBe(true)
  })

  it('is wrapped for tmux passthrough when inside tmux', () => {
    const hadBefore = 'TMUX' in process.env
    const saved = process.env['TMUX']
    process.env['TMUX'] = '/tmp/tmux-1000/default,1234,0'
    try {
      const wrapped = wrapForMultiplexer(CLEAR_PROGRAM_STATUS)
      // tmux DCS wrapper: ESC P tmux ; <payload> ESC \
      expect(wrapped.startsWith(`${ESC}Ptmux;`)).toBe(true)
      expect(wrapped.endsWith(ST)).toBe(true)
    } finally {
      if (hadBefore) process.env['TMUX'] = saved
      else delete process.env['TMUX']
    }
  })
})
