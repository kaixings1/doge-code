"""雷电游戏 - 主入口"""
import io
import pygame
import random
import sys

print("🎮 雷电游戏启动中...")
print("控制: 方向键 或 WASD 移动")
print("ESC: 退出 | R: 重新开始")
print("=" * 40)

# 直接运行游戏
exec(io.open(__file__.replace('main.py', 'game.py'), encoding='utf-8').read())
