import { describe, it, expect } from 'vitest'
import { getShellKind, getShellInvocation } from '../../utils/shellInvocation.js'

describe('getShellKind', () => {
  it('classifies PowerShell', () => {
    expect(getShellKind('powershell')).toBe('powershell')
    expect(getShellKind('powershell.exe')).toBe('powershell')
    expect(getShellKind('pwsh')).toBe('powershell')
    expect(getShellKind('pwsh.exe')).toBe('powershell')
    expect(getShellKind('C:\\Program Files\\PowerShell\\pwsh.exe')).toBe('powershell')
  })

  it('classifies cmd', () => {
    expect(getShellKind('cmd')).toBe('cmd')
    expect(getShellKind('cmd.exe')).toBe('cmd')
  })

  it('classifies WSL', () => {
    expect(getShellKind('wsl')).toBe('wsl')
    expect(getShellKind('wsl.exe')).toBe('wsl')
  })

  it('classifies POSIX shells as posix', () => {
    expect(getShellKind('bash')).toBe('posix')
    expect(getShellKind('/bin/bash')).toBe('posix')
    expect(getShellKind('zsh')).toBe('posix')
    expect(getShellKind('sh')).toBe('posix')
  })
})

describe('getShellInvocation', () => {
  it('returns PowerShell args with stdin input', () => {
    const result = getShellInvocation('powershell', 'echo hello')
    expect(result.args[0]).toBe('-NoProfile')
    expect(result.args[1]).toBe('-NonInteractive')
    expect(result.args[2]).toBe('-Command')
    expect(result.input).toBe('echo hello')
  })

  it('returns cmd args', () => {
    const result = getShellInvocation('cmd', 'echo hello')
    expect(result.args).toEqual(['/d', '/s', '/c', 'echo hello'])
    expect(result.input).toBeUndefined()
  })

  it('returns wsl args delegating to bash', () => {
    const result = getShellInvocation('wsl', 'echo hello')
    expect(result.args).toEqual(['bash', '-c', 'echo hello'])
  })

  it('returns posix args', () => {
    const result = getShellInvocation('bash', 'echo hello')
    expect(result.args).toEqual(['-c', 'echo hello'])
  })
})
