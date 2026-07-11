将应用部署到目标环境并执行前置/后置检查。

## 步骤

1. 从参数中确定目标环境（staging、production、preview）。
2. 运行部署前检查：
   - 所有测试通过：运行测试套件。
   - 无未提交的更改：`git status --porcelain`。
   - 分支是最新的：`git fetch && git status -uno`。
   - 构建成功：运行构建命令。
   - 无严重漏洞：运行依赖审计。
3. 检测部署方法：
   - **Vercel/Netlify**：`vercel --prod` 或 `netlify deploy --prod`。
   - **Docker**：构建镜像，推送到 registry，更新部署。
   - **Kubernetes**：使用 `kubectl apply` 应用清单。
   - **SSH**：rsync 构建产物并重启服务。
   - **GitHub Pages**：推送到 `gh-pages` 分支。
4. 执行部署：
   - 标记部署：`git tag deploy-<env>-<timestamp>`。
   - 运行部署命令。
   - 等待健康检查确认。
5. 运行部署后验证：
   - 访问健康端点并验证 200 响应。
   - 如果可用，运行冒烟测试。
   - 如果可访问，检查监控中的错误率。
6. 报告部署状态并附带回滚说明。

## 格式

```
部署：<environment>
版本：<git-sha-short>
状态：<success/failed>

前置检查：
  - [x] 测试通过
  - [x] 构建成功
  - [x] 无未提交的更改

部署时间：<timestamp>
URL：<deployment-url>
健康状态：<healthy/unhealthy>

回滚：<rollback-command>
```

## 规则

- 未经明确确认，绝不从非默认分支部署到生产环境。
- 始终运行部署前检查；任何失败则中止。
- 为每个生产部署创建部署标签。
- 在每次部署输出中包含回滚说明。
- 验证健康端点在部署后 60 秒内响应。
