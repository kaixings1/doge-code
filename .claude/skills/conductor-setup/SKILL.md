---
name: conductor-setup
description: "Conductor Setup — Conductor Setup 相关功能和最佳实践"
allowed-tools: Bash(chmod *), Bash(bundle *), Bash(npm *), Bash(script/server)
context: fork
risk: unknown
source: community
metadata:
  author: Shpigford
  version: "1.0"
---

为此 Rails 项目设置 Conductor，这是一个用于并行编码代理的 Mac 应用。

## 何时使用
- 你需要配置 Rails 项目使其在 Conductor 工作区中正确运行。
- 项目应支持具有隔离端口、Redis 设置和共享密钥的并行编码代理。
- 你需要 Rails 仓库的标准 `conductor.json`、`bin/conductor-setup` 和 `script/server` 脚手架。

# What to Create

## 1. conductor.json (project root)

Create `conductor.json` in the project root if it doesn't already exist:

```json
{
  "scripts": {
    "setup": "bin/conductor-setup",
    "run": "script/server"
  }
}
```

## 2. bin/conductor-setup (executable)

Create `bin/conductor-setup` if it doesn't already exist:

```bash
#!/bin/bash
set -e

# Symlink .env from repo root (where secrets live, outside worktrees)
[ -f "$CONDUCTOR_ROOT_PATH/.env" ] && ln -sf "$CONDUCTOR_ROOT_PATH/.env" .env

# Symlink Rails master key
[ -f "$CONDUCTOR_ROOT_PATH/config/master.key" ] && ln -sf "$CONDUCTOR_ROOT_PATH/config/master.key" config/master.key

# Install dependencies
bundle install
npm install
```

Make it executable with `chmod +x bin/conductor-setup`.

## 3. script/server (executable)

Create the `script` directory if needed, then create `script/server` if it doesn't already exist:

```bash
#!/bin/bash

# === Port Configuration ===
export PORT=${CONDUCTOR_PORT:-3000}
export VITE_RUBY_PORT=$((PORT + 1000))

# === Redis Isolation ===
if [ -n "$CONDUCTOR_WORKSPACE_NAME" ]; then
  HASH=$(printf '%s' "$CONDUCTOR_WORKSPACE_NAME" | cksum | cut -d' ' -f1)
  REDIS_DB=$((HASH % 16))
  export REDIS_URL="redis://localhost:6379/${REDIS_DB}"
fi

exec bin/dev
```

Make it executable with `chmod +x script/server`.

## 4. Update Rails Config Files

For each of the following files, if they exist and contain Redis configuration, update them to use `ENV.fetch('REDIS_URL', ...)` or `ENV['REDIS_URL']` with a fallback:

### config/initializers/sidekiq.rb
If this file exists and configures Redis, update it to use:
```ruby
redis_url = ENV.fetch('REDIS_URL', 'redis://localhost:6379/0')
```

### config/cable.yml
If this file exists, update the development adapter to use:
```yaml
development:
  adapter: redis
  url: <%= ENV.fetch('REDIS_URL', 'redis://localhost:6379/1') %>
```

### config/environments/development.rb
If this file configures Redis for caching, update to use:
```ruby
config.cache_store = :redis_cache_store, { url: ENV.fetch('REDIS_URL', 'redis://localhost:6379/0') }
```

### config/initializers/rack_attack.rb
If this file exists and configures a Redis cache store, update to use:
```ruby
Rack::Attack.cache.store = ActiveSupport::Cache::RedisCacheStore.new(url: ENV.fetch('REDIS_URL', 'redis://localhost:6379/0'))
```

# Implementation Notes

- **Don't overwrite existing files**: Check if conductor.json, bin/conductor-setup, and script/server exist before creating them. If they exist, skip creation and inform the user.
- **Rails config updates**: Only modify Redis-related configuration. If a file doesn't exist or doesn't use Redis, skip it gracefully.
- **Create directories as needed**: Create `script/` directory if it doesn't exist.

# Verification

After creating the files:
1. Confirm all Conductor files exist and scripts are executable
2. Run `script/server` to verify it starts without errors
3. Check that Rails configs properly reference `ENV['REDIS_URL']` or `ENV.fetch('REDIS_URL', ...)`

## 局限性
- Use this skill only when the task clearly matches the scope described above.
- Do not treat the output as a substitute for environment-specific validation, testing, or expert review.
- Stop and ask for clarification if required inputs, permissions, safety boundaries, or success criteria are missing.
