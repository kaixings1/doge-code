# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Doge Code** is a modified/fork of Claude Code with Chinese localization, custom API endpoint support, and OpenAI Anthropic-compatible API translation layer.

- **Runtime**: Bun 1.3.5+ and Node.js 24+
- **Package Manager**: Bun
- **Type**: TypeScript (with React components)

## Development Commands

```bash
# Install dependencies
bun install

# Start development server
bun run dev
# or
bun run ./src/bootstrap-entry.ts

# Build (if needed)
bun run build

# Check version
bun run version
```

## Key Architecture

### Entry Points
- **Main entry**: `src/bootstrap-entry.ts`
- **Dev entry**: `src/dev-entry.ts`

### Core Directories
- `src/bridge/` - Bridge layer for API translation (OpenAI ↔ Anthropic Messages)
- `src/coordinator/` - Task coordination and session management
- `src/components/` - React UI components (TUI)
- `src/tools/` - Tool definitions and execution
- `src/query/` - Query engine for tool processing
- `src/tasks/` - Task management
- `src/state/` - Application state management
- `src/hooks/` - React hooks
- `src/ink/` - Ink framework components for TUI

### Key Files
- `src/core.ts` - Core application logic
- `src/commands.ts` - Command definitions
- `src/main.tsx` - Main UI rendering
- `src/components/ConsoleOAuthFlow.tsx` - OAuth/login flow

### OAuth Flow
The `ConsoleOAuthFlow.tsx` handles login with support for:
- Custom API endpoints (OpenAI-compatible, Anthropic-compatible)
- Model selection from presets or saved configurations
- API key configuration

### Configuration
- User config directory: `~/.doge/`
- Global config: `~/.doge/.claude.json`
- Environment variables used:
  - `ANTHROPIC_MODEL`
  - `ANTHROPIC_BASE_URL`
  - `DOGE_API_KEY`
  - `CLAUDE_CODE_COMPATIBLE_API_PROVIDER`

## Build & Deployment

- **npm package**: `@doge-code/cli`
- **Binary name**: `doge`
- Uses Bun for linking: `bun link`

## Notes

- This is a fork of Claude Code, not the official repository
- Chinese localization applied throughout
- Supports custom Anthropic-compatible endpoints
- Configuration isolated to `.doge/` directory
