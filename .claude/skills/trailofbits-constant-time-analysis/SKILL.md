# 恒定时间分析器

A portable tool for detecting timing side-channel vulnerabilities in compiled cryptographic code. Analyzes assembly output from multiple compilers and architectures to detect instructions that could leak secret data through execution timing.

## Background

Timing side-channel attacks exploit variations in execution time to extract secret information from cryptographic implementations. Common sources include:

- **Hardware division** (`DIV`, `IDIV`): Execution time varies based on operand values
- **Floating-point operations** (`FDIV`, `FSQRT`): Variable latency based on inputs
- **Conditional branches**: Different execution paths have different timing

The infamous [KyberSlash](https://kyberslash.cr.yp.to/) attack demonstrated how division instructions in post-quantum cryptographic implementations could be exploited to recover secret keys.

## 特性

- **Multi-language support**: C, C++, Go, Rust, PHP, JavaScript, TypeScript, Python, Ruby
- **Multi-architecture support**: x86_64, ARM64, ARM, RISC-V, PowerPC, s390x, i386
- **Multi-compiler support**: GCC, Clang, Go compiler, Rustc
- **Scripting language support**: PHP (VLD/opcache), JavaScript/TypeScript (V8 bytecode), Python (dis), Ruby (YARV)
- **Optimization-level testing**: Test across O0-O3, Os, Oz
- **Multiple output formats**: Text, JSON, GitHub Actions annotations
- **Cross-compilation**: Analyze code for different target architectures

## 快速开始

```bash
# Install
uv pip install -e .

# Analyze a C file
ct-analyzer crypto.c
```

## 用法

### Basic Analysis

```bash
ct-analyzer <source_file>
```

### Options

| Option | Description |