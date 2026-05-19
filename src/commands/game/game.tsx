import * as React from 'react'
import { useState } from 'react'
import { Box, Text, useInput } from '../../ink.js'
import type { LocalJSXCommandCall } from '../../types/command.js'

type GameState = {
  targetNumber: number
  attempts: number
  maxAttempts: number
  message: string
  hasWon: boolean
  gameOver: boolean
}

export const call: LocalJSXCommandCall = async (onDone, _context, _args) => {
  const [gameState, setGameState] = useState<GameState>({
    targetNumber: Math.floor(Math.random() * 100) + 1,
    attempts: 0,
    maxAttempts: 10,
    message: '我已经想好了一个 1-100 之间的数字。试试猜一下！',
    hasWon: false,
    gameOver: false,
  })

  const [input, setInput] = useState('')

  useInput((_input, key) => {
    if (key.escape) {
      onDone(undefined, { display: 'skip' })
      return
    }
    if (key.return && input) {
      const guess = parseInt(input, 10)
      if (isNaN(guess) || guess < 1 || guess > 100) {
        setGameState(prev => ({ ...prev, message: '请输入 1-100 之间的数字' }))
        setInput('')
        return
      }

      setGameState(prev => {
        const newAttempts = prev.attempts + 1
        if (guess === prev.targetNumber) {
          return {
            ...prev,
            attempts: newAttempts,
            hasWon: true,
            gameOver: true,
            message: `恭喜！你用了 ${newAttempts} 次就猜中了数字 ${prev.targetNumber}！`,
          }
        }
        if (newAttempts >= prev.maxAttempts) {
          return {
            ...prev,
            attempts: newAttempts,
            gameOver: true,
            message: `游戏结束！正确的数字是 ${prev.targetNumber}`,
          }
        }
        const diff = guess < prev.targetNumber ? '大一点' : '小一点'
        return {
          ...prev,
          attempts: newAttempts,
          message: `${diff}。还剩 ${prev.maxAttempts - newAttempts} 次机会。`,
        }
      })
      setInput('')
    } else if (/^[0-9]$/.test(_input) && !gameState.gameOver && input.length < 3) {
      setInput(prev => prev + _input)
    } else if ((key.backspace || key.delete) && !gameState.gameOver) {
      setInput(prev => prev.slice(0, -1))
    }
  })

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>🎮 猜数字游戏</Text>
      <Box marginTop={1}>
        <Text>{gameState.message}</Text>
      </Box>
      {!gameState.gameOver && (
        <Box marginTop={1}>
          <Text>你的猜测: </Text>
          <Text backgroundColor="blue" color="white" padding={1}>
            {input || '_'}
          </Text>
        </Box>
      )}
      {!gameState.gameOver && (
        <Box marginTop={1}>
          <Text dimColor>按 Enter 提交 | Esc 退出</Text>
        </Box>
      )}
      {gameState.gameOver && (
        <Box marginTop={1}>
          <Text color="green">游戏结束！按 Esc 退出</Text>
        </Box>
      )}
    </Box>
  )
}
