import type { Command } from '../../commands.js'
import type { LocalJSXCommandCall } from '../../types/command.js'
import { Box, Text, useInput } from '../../ink.js'
import * as React from 'react'

export const call: LocalJSXCommandCall = async (onDone, _context, _args) => {
  const [step, setStep] = React.useState(0)
  const steps = ['欢迎使用 Doge Code！', '配置你的 API 端点', '选择模型', '完成设置']

  useInput((_input, key) => {
    if (key.escape) {
      onDone(undefined, { display: 'skip' })
      return
    }
    if (key.return) {
      if (step < steps.length - 1) {
        setStep(step + 1)
      } else {
        onDone('引导设置完成！', { display: 'skip' })
      }
    }
  })

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>🚀 新手引导</Text>
      <Box marginTop={1}>
        <Text>{steps[step]}</Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>按 Enter 继续 | Esc 退出</Text>
      </Box>
    </Box>
  )
}

const onboarding = {
  type: 'local-jsx',
  name: 'onboarding',
  description: '运行新手引导',
  load: () => Promise.resolve({ call }),
} satisfies Command

export default onboarding
