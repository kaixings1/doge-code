---
name: Emscripten 工具链
description: Emscripten — 将 C/C++/Rust 等编译为 WebAssembly 的工具链。
---

# Emscripten

Emscripten 是 LLVM 到 WebAssembly 的编译器，支持 C/C++/Rust/Go 等语言。

## 适用场景
- 将 C/C++ 库移植到 Web
- 游戏引擎 Web 化
- 高性能计算（HPC）Web 化

## 快速开始
```bash
# 安装
git clone https://github.com/emscripten-core/emsdk.git && cd emsdk
./emsdk install latest && ./emsdk activate latest

# 编译 C 为 .wasm
emcc hello.c -o hello.html
```
