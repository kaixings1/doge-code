# IDE Integration

Xmake integrates with various IDEs and editors.

## VSCode

### Installation

Install the xmake-vscode extension from VSCode marketplace.

### Configuration

```json
{
    "xmake.buildDirectory": "build",
    "xmake.outputDirectory": "build"
}
```

### Commands

- `xmake: Build` - Build project
- `xmake: Create Project` - Create new project
- `xmake: Run` - Run target
- `xmake: Debug` - Debug target

## IntelliJ IDEA / CLion

### Installation

Install xmake-idea plugin from JetBrains marketplace.

### Configuration

Configure xmake path in plugin settings.

## Vim/Neovim

### Using xmake.nvim

```lua
-- init.lua
require('xmake').setup({
    -- configuration
})
```

### Commands

```vim
:Xmake build
:Xmake run
:Xmake debug
```

## Emacs

### Using xmake-el

```elisp
(require 'xmake)
```

## Visual Studio

### Generate VS Project

```bash
xmake project -k vsxmake
xmake project -k vs
```

### Plugin

Use xmake-vscode or xmake-idea for VS integration.

## Zed Editor

### Installation

Install xmake extension from Zed extensions.

## Language Server Protocol (LSP)

Xmake provides LSP for better IDE integration:

```bash
xmake lsp install
```

### LSP Configuration

```json
{
    "xmake.lsp.address": "127.0.0.1",
    "xmake.lsp.port": 5008
}
```

## Best Practices

1. Use VSCode for quick development
2. Use IDE plugins for debugging support
3. Generate IDE projects for team members
4. Use LSP for code completion
