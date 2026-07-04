# Devcontainer 设置插件

Create pre-configured devcontainers with Claude Code and language-specific tooling.

## Features

- **Claude Code** pre-installed with `bypassPermissions` auto-configured and marketplace plugins
- **Multi-language support**: Python 3.13, Node 22, Rust, Go
- **Modern CLI tools**: ripgrep, fd, fzf, tmux, git-delta, ast-grep
- **Session persistence**: command history, GitHub CLI auth, Claude config survive rebuilds
- **Sandboxing**: bubblewrap and socat for Claude Code sandboxing support
- **Network isolation**: iptables/ipset with NET_ADMIN capability for restricting outbound traffic
- **Token forwarding**: `CLAUDE_CODE_OAUTH_TOKEN` and `ANTHROPIC_API_KEY` forwarded to container

## 用法

Tell Claude to "set up a devcontainer" or "add devcontainer support" in your project.

The skill will:
1. Detect your project's language stack
2. Generate `.devcontainer/` configuration files
3. Provide instructions for starting the container

## Generated Files

| File | Purpose |