#!/usr/bin/env python3
from src.utils.display import print_prompt, print_success, print_error, print_info, print_loading

def get_user_input(prompt_text: str) -> str:
    """获取用户输入，展示带emoji的交互提示"""
    print_prompt(prompt_text)
    return input().strip()

def show_welcome():
    """展示欢迎信息给用户"""
    print_info("欢迎使用自动化运维工具！")
    print_info("请根据下方提示完成操作")

def show_operation_result(success: bool, message: str):
    """展示操作结果给用户"""
    if success:
        print_success(f"操作执行成功：{message}")
    else:
        print_error(f"操作执行失败：{message}")

def show_task_loading(task_name: str):
    """展示任务加载状态给用户"""
    print_loading(f"正在处理「{task_name}」，请稍候...")

def validate_user_input(user_input: str) -> bool:
    """校验用户输入，异常时展示带emoji的警告"""
    if not user_input:
        print_warning("输入内容不能为空，请重新输入")
        return False
    if len(user_input) > 100:
        print_warning("输入长度超出限制，最多支持100个字符")
        return False
    return True

def run_interaction_flow():
    """核心用户交互流程，所有用户可见内容均带emoji"""
    show_welcome()
    show_task_loading("系统初始化")
    
    user_name = get_user_input("请输入您的姓名")
    if not validate_user_input(user_name):
        show_operation_result(False, "输入校验不通过")
        return
    
    show_operation_result(True, f"身份验证通过，欢迎 {user_name}！")
    print_info("所有操作已完成，感谢使用")

if __name__ == "__main__":
    run_interaction_flow()
