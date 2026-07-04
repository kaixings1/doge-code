---
name: Wasmtime 运行时
description: Wasmtime 是字节码联盟官方推荐的 WebAssembly 运行时，支持 WASI 和组件模型。
---

# Wasmtime

Wasmtime 是快速、安全的 WASM 运行时，支持 WASI（WebAssembly System Interface）。

## 核心特性
- WASI 完整支持
- Component Model 组件模型
- 多语言支持（Rust, C, C++, Go）
- 生产级安全隔离

## 快速开始
```bash
# 安装
curl -sSf https://rustup.rs | sh

# 运行 .wasm
wasmtime run program.wasm
```
