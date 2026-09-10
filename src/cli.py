#!/usr/bin/env python3
"""
🖥️ 命令行界面
主要与用户交互的入口
"""

import sys
from core.checker import ContentChecker
from ui.display import Display
from ui.prompts import Prompts

def main():
    """🎯 主函数"""
    checker = ContentChecker()
    display = Display()
    prompts = Prompts()
    
    # 👋 显示欢迎信息
    print(display.show_welcome())
    
    while True:
        try:
            # 💬 获取用户输入
            user_input = input(prompts.ask_for_input())
            
            if not user_input.strip():
                print(display.show_error("⚠️ 输入不能为空!"))
                continue
            
            # 🔍 执行检查
            result = checker.validate_user_interaction(user_input)
            
            # 📊 显示结果
            print(display.show_result(result))
            
            # 🔄 询问是否继续
            continue_choice = input(prompts.ask_continue())
            if continue_choice.lower() != 'y':
                print(display.show_success("👋 再见!"))
                break
                
        except KeyboardInterrupt:
            print(f"\n{display.show_success('👋 程序已中断，再见!')}")
            sys.exit(0)
        except Exception as e:
            print(display.show_error(f"💥 发生错误: {str(e)}"))

if __name__ == "__main__":
    main()
