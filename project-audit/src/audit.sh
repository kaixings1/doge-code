#!/bin/bash
# 项目能力审计主入口脚本

set -e

# 默认配置
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="."
OUTPUT_DIR="output"
CONFIG_FILE="config/audit.conf"
OUTPUT_FORMAT="text"

# 参数解析
while [[ $# -gt 0 ]]; do
    case $1 in
        -p|--project-root)
            PROJECT_ROOT="$2"
            shift 2
            ;;
        -o|--output-dir)
            OUTPUT_DIR="$2"
            shift 2
            ;;
        -c|--config)
            CONFIG_FILE="$2"
            shift 2
            ;;
        --output-format)
            OUTPUT_FORMAT="$2"
            shift 2
            ;;
        -h|--help)
            echo "用法: $0 [选项]"
            echo "选项:"
            echo "  -p, --project-root DIR   待审计的项目根目录（默认：当前目录）"
            echo "  -o, --output-dir DIR     审计结果输出目录（默认：output/）"
            echo "  -c, --config FILE        自定义配置文件路径（默认：config/audit.conf）"
            echo "      --output-format FMT  输出格式：text/json（默认：text）"
            echo "  -h, --help               显示帮助信息"
            exit 0
            ;;
        *)
            echo "未知参数: $1"
            exit 1
            ;;
    esac
done

# 加载配置文件
if [ -f "$CONFIG_FILE" ]; then
    source "$CONFIG_FILE"
else
    echo "警告：配置文件 $CONFIG_FILE 不存在，使用默认配置"
fi

# 创建输出目录
mkdir -p "$OUTPUT_DIR"

# 执行审计流程
echo "=== 开始项目能力审计 ==="
echo "项目根目录: $PROJECT_ROOT"
echo "输出目录: $OUTPUT_DIR"
echo ""

# 1. 执行源码扫描
echo "步骤 1/3：扫描源码..."
bash "$SCRIPT_DIR/scanner.sh" \
    -p "$PROJECT_ROOT" \
    -o "$OUTPUT_DIR" \
    -e "$SCAN_EXTENSIONS" \
    -i "$IGNORE_DIRS" \
    -I "$IGNORE_EXTENSIONS" \
    -r "$RECURSIVE"

# 2. 执行文档解析
echo ""
echo "步骤 2/3：解析文档..."
bash "$SCRIPT_DIR/doc_parser.sh" \
    -p "$PROJECT_ROOT" \
    -o "$OUTPUT_DIR" \
    -i "$IGNORE_DIRS"

# 3. 执行差异对比
echo ""
echo "步骤 3/3：对比分析..."
bash "$SCRIPT_DIR/comparator.sh" \
    -s "$OUTPUT_DIR/tools_raw.txt" \
    -d "$OUTPUT_DIR/docs_content.txt" \
    -o "$OUTPUT_DIR/missing_docs.txt" \
    -f "$OUTPUT_FORMAT"

# 输出结果摘要
echo ""
echo "=== 审计完成 ==="
echo "结果已输出到: $OUTPUT_DIR"
echo "缺失能力清单: $OUTPUT_DIR/missing_docs.txt"
if [ "$OUTPUT_FORMAT" = "json" ]; then
    echo "JSON格式报告: $OUTPUT_DIR/audit_report.json"
fi

# 检查是否有缺失项
if [ -f "$OUTPUT_DIR/missing_docs.txt" ] && [ -s "$OUTPUT_DIR/missing_docs.txt" ]; then
    echo ""
    echo "警告：发现 $(wc -l < "$OUTPUT_DIR/missing_docs.txt") 项能力未更新到文档中，请查看 $OUTPUT_DIR/missing_docs.txt"
    exit 1
else
    echo ""
    echo "✓ 所有能力已更新到文档中"
    exit 0
fi
