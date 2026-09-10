#!/usr/bin/env python3
"""
🔍 核心检查模块
负责执行各种检查逻辑
"""

class ContentChecker:
    """✅ 内容检查器"""
    
    def check_emoji_presence(self, content: str) -> bool:
        """🔎 检查内容是否包含emoji"""
        return any(ord(char) > 0x1F300 for char in content)
    
    def validate_user_interaction(self, text: str) -> dict:
        """🛡️ 验证用户交互内容"""
        has_emoji = self.check_emoji_presence(text)
        return {
            "✅ 状态": "通过" if has_emoji else "❌ 失败",
            "📝 内容": text,
            "🎯 包含Emoji": has_emoji
        }

