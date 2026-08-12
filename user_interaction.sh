#!/bin/bash
# 用户输入请求函数：接收提示文本作为参数，返回用户输入内容
ask_for_input() {
    local prompt_content="$1"
    # 向用户展示提示内容，-n参数避免输出后自动换行，-e参数启用转义支持颜色等格式（可按需调整）
    echo -n -e "${prompt_content}: "
    # 读取用户输入并存储到变量
    read -r user_input
    # 输出用户输入供外部调用捕获
    echo "${user_input}"
}

# 交互模块调用示例
read -p "请确认是否启动后续流程 (y/n): " confirm_result
if [[ "$confirm_result" =~ ^[Yy]$ ]]; then
    config_path=$(ask_for_input "请输入配置文件路径")
    echo "你输入的配置路径是: ${config_path}"
else
    echo "已取消操作"
    exit 0
fi
