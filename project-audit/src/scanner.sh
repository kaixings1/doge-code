#!/bin/bash
# 源码扫描模块：提取项目中的工具、命令、能力

# 扫描项目，输出JSON格式结果
# 参数1：项目根路径
# 参数2：忽略路径列表（逗号分隔）
scan_project() {
    local project_root="${1:-.}"
    local ignore_patterns="${2:-node_modules,.git}"
    
    local tools=()
    local commands=()
    local capabilities=()
    
    # 递归扫描所有匹配扩展名的文件
    find "$project_root" -type f \( -name "*.sh" -o -name "*.py" -o -name "*.js" -o -name "*.ts" -o -name "*.md" -o -name "*.txt" -o -name "*.json" -o -name "*.yaml" -o -name "*.yml" -o -name "*.conf" \) | while read -r file; do
        # 跳过忽略的路径
        local skip=0
        IFS=',' read -ra ignores <<< "$ignore_patterns"
        for ignore in "${ignores[@]}"; do
            if [[ "$file" == *"$ignore"* ]]; then
                skip=1
                break
            fi
        done
        [[ $skip -eq 1 ]] && continue
        
        # 提取工具调用（如grep、awk、sed、docker、kubectl等常见工具）
        local file_tools=$(grep -oE '\b(grep|awk|sed|curl|wget|docker|kubectl|git|npm|yarn|python|node|java|gcc|make|ssh|scp|tar|gzip|zip|unzip|jq|yq|mysql|psql|redis-cli|helm|terraform|ansible)\b' "$file" | sort -u)
        for tool in $file_tools; do
            tools+=("\"$tool\"")
        done
        
        # 提取命令执行（如$(command)、`command`、exec command等）
        local file_commands=$(grep -oE '\$\([^)]+\)|`[^`]+`|exec [a-zA-Z0-9_\-]+' "$file" | sort -u)
        for cmd in $file_commands; do
            commands+=("\"$cmd\"")
        done
        
        # 提取能力标识（如注释中的TODO、FIXME，或者特定功能标记）
        local file_caps=$(grep -oE '#\s*(TODO|FIXME|FEATURE|CAPABILITY):\s*.+' "$file" | sed 's/#\s*//' | sort -u)
        for cap in $file_caps; do
            capabilities+=("\"$cap\"")
        done
    done
    
    # 去重并输出JSON
    printf '{"tools":[%s],"commands":[%s],"capabilities":[%s]}' \
        "$(printf '%s\n' "${tools[@]}" | sort -u | paste -sd, -)" \
        "$(printf '%s\n' "${commands[@]}" | sort -u | paste -sd, -)" \
        "$(printf '%s\n' "${capabilities[@]}" | sort -u | paste -sd, -)"
}
