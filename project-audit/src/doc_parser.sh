#!/bin/bash
# 文档解析模块：提取文档中记录的工具、命令、能力

# 解析文档，输出JSON格式结果
# 参数1：文档目录路径
# 参数2：文档匹配规则（逗号分隔）
parse_docs() {
    local docs_dir="${1:-./docs}"
    local doc_patterns="${2:-*.md,*.txt}"
    
    local doc_tools=()
    local doc_commands=()
    local doc_capabilities=()
    
    # 递归扫描所有匹配的文档文件
    find "$docs_dir" -type f | while read -r doc; do
        # 检查是否匹配文档规则
        local match=0
        IFS=',' read -ra patterns <<< "$doc_patterns"
        for pattern in "${patterns[@]}"; do
            if [[ "$doc" == $pattern ]]; then
                match=1
                break
            fi
        done
        [[ $match -eq 0 ]] && continue
        
        # 提取文档中提到的工具（常见工具列表，或带标记的工具）
        local doc_t=$(grep -oE '\b(grep|awk|sed|curl|wget|docker|kubectl|git|npm|yarn|python|node|java|gcc|make|ssh|scp|tar|gzip|zip|unzip|jq|yq|mysql|psql|redis-cli|helm|terraform|ansible)\b' "$doc" | sort -u)
        for t in $doc_t; do
            doc_tools+=("\"$t\"")
        done
        
        # 提取文档中提到的命令
        local doc_cmd=$(grep -oE '\$\([^)]+\)|`[^`]+`|exec [a-zA-Z0-9_\-]+|使用命令[:：]\s*.+' "$doc" | sed 's/使用命令[:：]\s*//' | sort -u)
        for c in $doc_cmd; do
            doc_commands+=("\"$c\"")
        done
        
        # 提取文档中记录的能力（如功能列表、特性标记）
        local doc_cap=$(grep -oE '##\s*.+功能|###\s*.+特性|CAPABILITY:\s*.+' "$doc" | sed 's/##\s*//;s/###\s*//;s/CAPABILITY:\s*//' | sort -u)
        for cap in $doc_cap; do
            doc_capabilities+=("\"$cap\"")
        done
    done
    
    # 去重并输出JSON
    printf '{"doc_tools":[%s],"doc_commands":[%s],"doc_capabilities":[%s]}' \
        "$(printf '%s\n' "${doc_tools[@]}" | sort -u | paste -sd, -)" \
        "$(printf '%s\n' "${doc_commands[@]}" | sort -u | paste -sd, -)" \
        "$(printf '%s\n' "${doc_capabilities[@]}" | sort -u | paste -sd, -)"
}
