#!/bin/bash
# 对比分析模块：对比扫描结果和文档结果，找出缺失项

# 对比两个JSON结果，输出差异JSON
# 参数1：扫描结果JSON
# 参数2：文档解析结果JSON
compare_results() {
    local scan_result="${1:-{\"tools\":[],\"commands\":[],\"capabilities\":[]}}"
    local doc_result="${2:-{\"doc_tools\":[],\"doc_commands\":[],\"doc_capabilities\":[]}}"
    
    # 提取扫描结果的各个数组
    local scan_tools=$(echo "$scan_result" | jq -r '.tools[]' 2>/dev/null | sort -u)
    local scan_commands=$(echo "$scan_result" | jq -r '.commands[]' 2>/dev/null | sort -u)
    local scan_caps=$(echo "$scan_result" | jq -r '.capabilities[]' 2>/dev/null | sort -u)
    
    # 提取文档结果的各个数组
    local doc_tools=$(echo "$doc_result" | jq -r '.doc_tools[]' 2>/dev/null | sort -u)
    local doc_commands=$(echo "$doc_result" | jq -r '.doc_commands[]' 2>/dev/null | sort -u)
    local doc_caps=$(echo "$doc_result" | jq -r '.doc_capabilities[]' 2>/dev/null | sort -u)
    
    # 计算缺失的工具（扫描有但文档没有的）
    local missing_tools=()
    while IFS= read -r tool; do
        if [[ -n "$tool" && ! " ${doc_tools[*]} " =~ " ${tool} " ]]; then
            missing_tools+=("\"$tool\"")
        fi
    done <<< "$scan_tools"
    
    # 计算缺失的命令
    local missing_commands=()
    while IFS= read -r cmd; do
        if [[ -n "$cmd" && ! " ${doc_commands[*]} " =~ " ${cmd} " ]]; then
            missing_commands+=("\"$cmd\"")
        fi
    done <<< "$scan_commands"
    
    # 计算缺失的能力
    local missing_caps=()
    while IFS= read -r cap; do
        if [[ -n "$cap" && ! " ${doc_caps[*]} " =~ " ${cap} " ]]; then
            missing_caps+=("\"$cap\"")
        fi
    done <<< "$scan_caps"
    
    # 计算过期项（文档有但扫描没有的）
    local outdated_items=()
    while IFS= read -r item; do
        if [[ -n "$item" ]]; then
            outdated_items+=("\"$item\"")
        fi
    done < <(comm -23 <(echo "$doc_tools" "$doc_commands" "$doc_caps" | sort -u) <(echo "$scan_tools" "$scan_commands" "$scan_caps" | sort -u))
    
    # 输出JSON结果
    printf '{"missing_tools":[%s],"missing_commands":[%s],"missing_capabilities":[%s],"outdated_items":[%s]}' \
        "$(printf '%s\n' "${missing_tools[@]}" | paste -sd, -)" \
        "$(printf '%s\n' "${missing_commands[@]}" | paste -sd, -)" \
        "$(printf '%s\n' "${missing_caps[@]}" | paste -sd, -)" \
        "$(printf '%s\n' "${outdated_items[@]}" | paste -sd, -)"
}
