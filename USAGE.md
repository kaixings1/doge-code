# 使用说明
## 1. 环境要求
- Node.js >= 18.x / Bun >= 1.0.x
- 内存建议：根据单批次处理数据大小调整，处理大文件建议预留至少2倍数据大小的内存
---
## 2. 安装依赖
\`\`\`bash
bun install
# 或
npm install
\`\`\`
---
## 3. 基础用法
### 单文件处理
\`\`\`bash
bun run start --file ./test.txt
\`\`\`
### 批量目录处理（长时间运行推荐）
\`\`\`bash
# 配置输入输出目录，程序会自动处理输入目录下所有符合规则的文件
bun run start --input ./input_data --output ./output_result
\`\`\`
---
## 4. 长时间运行配置
### 4.1 断点续传设置
在配置文件\`config.yaml\`中开启：
\`\`\`yaml
checkpoint:
  enabled: true
  save_interval: 300 # 每5分钟保存一次中间结果
  checkpoint_dir: ./checkpoints # 中间结果保存路径
\`\`\`
程序中断后重启会自动读取\`checkpoint_dir\`下的记录，跳过已处理文件。
### 4.2 内存优化配置
\`\`\`yaml
memory:
  max_heap_size: 4096 # 最大堆内存限制（MB），超过会触发垃圾回收或重启
  batch_size: 100 # 单批次处理文件数量，根据内存大小调整
  release_after_batch: true # 单批次处理后主动释放内存
\`\`\`
### 4.3 进程守护（推荐用于超长时间运行）
使用pm2守护进程：
\`\`\`bash
pm2 start "bun run start --input ./input_data --output ./output_result" --name long-task
# 查看日志
pm2 logs long-task
# 设置内存超限自动重启（超过4GB重启）
pm2 restart long-task --max-memory-restart 4G
\`\`\`
---
## 5. 稳定性排查
### 5.1 内存泄漏排查
开启内存快照保存：
\`\`\`bash
bun run
