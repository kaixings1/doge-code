import React from 'react';
import type { Input } from './TeamCreateTool.js';
export function renderToolUseMessage(input: Partial<Input>): React.ReactNode {
  return `创建团队：${input.team_name}`;
}
