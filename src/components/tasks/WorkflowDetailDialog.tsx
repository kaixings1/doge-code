import React from 'react'
import type { DeepImmutable } from '../../types/utils.js'
import { Box, Text } from '../../ink.js'
import { Dialog } from '../design-system/Dialog.js'
import { KeyboardShortcutHint } from '../design-system/KeyboardShortcutHint.js'
import type { LocalWorkflowTaskState } from '../../tasks/LocalWorkflowTask/LocalWorkflowTask.js'

type Props = {
  workflow: DeepImmutable<LocalWorkflowTaskState>
  onDone: () => void
  onBack?: () => void
  onKill?: () => void
  onSkipAgent?: (agentId: string) => void
  onRetryAgent?: (agentId: string) => void
}

const STATUS_LABEL: Record<string, string> = {
  running: '运行中',
  completed: '✓ 已完成',
  failed: '✗ 失败',
  killed: '已停止',
  pending: '等待中',
}

export function WorkflowDetailDialog({ workflow, onDone, onBack, onKill }: Props) {
  const total = workflow.steps.length
  const current = workflow.currentStep
  const pct = total > 0 ? Math.round((current / total) * 100) : 0
  const statusLabel = STATUS_LABEL[workflow.status] ?? workflow.status

  return (
    <Dialog
      title={`工作流: ${workflow.workflowName}`}
      subtitle={
        <Text dimColor>
          {workflow.status === 'running' ? `进度 ${current}/${total} (${pct}%)` : statusLabel}
        </Text>
      }
      onCancel={onDone}
      color="background"
      inputGuide={
        <>
          <KeyboardShortcutHint shortcut="Esc/Enter" action="关闭" />
          {onBack && <KeyboardShortcutHint shortcut="←" action="返回" />}
          {workflow.status === 'running' && onKill && <KeyboardShortcutHint shortcut="x" action="停止" />}
        </>
      }
    >
      <Box flexDirection="column" gap={1}>
        <Text bold>状态: {statusLabel}</Text>

        <Box flexDirection="column">
          {workflow.steps.map((step, i) => {
            const done = i < current
            const active = i === current && workflow.status === 'running'
            const result = workflow.stepResults[i]
            return (
              <Box key={i} flexDirection="column">
                <Text color={active ? 'background' : done ? 'success' : 'gray'}>
                  {done ? '✓' : active ? '▶' : '·'} {i + 1}. {step}
                </Text>
                {result && (
                  <Text dimColor wrap="wrap">
                    {'  '}
                    {result}
                  </Text>
                )}
              </Box>
            )
          })}
        </Box>

        {workflow.summary && (
          <Box flexDirection="column">
            <Text bold>结果:</Text>
            <Text wrap="wrap" color={workflow.failed ? 'error' : void 0}>
              {workflow.summary}
            </Text>
          </Box>
        )}
      </Box>
    </Dialog>
  )
}
