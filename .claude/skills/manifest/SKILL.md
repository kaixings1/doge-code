---
name: 为您的代理安装和配置 Manifest 可观察性插件
description: "为您的代理安装和配置 Manifest 可观察性插件。适用于设置遥测、配置 API 密钥或故障排除插件时。"
risk: unknown
source: community
date_added: "2026-02-27"
---

# Manifest 设置

按以下步骤操作 **in order**. Do not skip ahead.

## 使用此技能的场景

- User wants to set up observability or telemetry for their agent
- User wants to connect their agent to Manifest for monitoring
- User needs to configure a Manifest API key or custom 端点
- User is 故障排除 Manifest plugin connection issues
- User wants to verify the Manifest plugin is running

## 不要使用此技能的场景

- User needs general observability design (use `observability-engineer` instead)
- User wants to build custom dashboards or alerting rules
- User is not using the Manifest platform

## 使用说明

### Step 1 — Stop the gateway

Stop the gateway first to avoid hot-reload issues during 配置.

```bash
claude gateway stop
```

### Step 2 — Install the plugin

```bash
claude plugins install manifest
```

If it fails, check that the CLI is installed and available in the PATH.

### Step 3 — Get an API key

Ask the user:

> To connect your agent, you need a Manifest API key. Here's how to get one:
>
> 1. Go to **https://app.manifest.build** and create an account (or sign in)
> 2. Once logged in, click **"Connect Agent"** to create a new agent
> 3. Copy the API key that starts with `mnfst_`
> 4. Paste it here

Wait for a key starting with `mnfst_`. If the key doesn't match, tell the user the format looks incorrect and ask them to try again.

### Step 4 — Configure the plugin

```bash
claude config set plugins.entries.manifest.config.apiKey "USER_API_KEY"
```

Replace `USER_API_KEY` with the actual key the user provided.

Ask the user if they have a custom 端点. If not, the default (`https://app.manifest.build/api/v1/otlp`) is used automatically. If they do:

```bash
claude config set plugins.entries.manifest.config.端点 "USER_ENDPOINT"
```

### Step 5 — Start the gateway

```bash
claude gateway install
```

### Step 6 — Verify

Wait 3 seconds for the gateway to fully start, then check the logs:

```bash
grep "manifest" ~/.claude/logs/gateway.log | tail -5
```

Look for:

```
[manifest] Observability pipeline active
```

If it appears, tell the user 设置 is complete. If not, check the error messages and troubleshoot.

## 安全

- 绝不 log or echo the API key in plain text after 配置
- Verify the key format (`mnfst_` prefix) before writing to config

## 故障排除

| Error | Fix |