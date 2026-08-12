#!/bin/bash
# 用户交互模块核心能力
show_main_menu() {
    echo "=============================="
    echo "🎯 应用配置管理平台"
    echo "=============================="
    echo "1. 查看当前配置"
    echo "2. 修改配置项"
    echo "3. 查看系统日志"
    echo "4. 退出系统"
    echo -n "请输入操作编号："
}
show_config_detail() {
    echo "========== 当前配置详情 =========="
    cat ../config/app.conf
    echo "=================================="
}
show_error() {
    echo "错误：$1" >&2
}
