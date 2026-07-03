# Constant-Time Analyzer (ct-analyzer)

A portable tool for detecting timing side-channel vulnerabilities in compiled cryptographic code. Analyzes assembly output from multiple compilers and architectures to detect instructions that could leak secret data through execution timing.

## Background

Timing side-channel attacks exploit variations in execution time to extract secret information from cryptographic implementations. Common sources include:

- **Hardware division** (`DIV`, `IDIV`): Execution time varies based on operand values
- **Floating-point operations** (`FDIV`, `FSQRT`): Variable latency based on inputs
- **Conditional branches**: Different execution paths have different timing

The infamous [KyberSlash](https://kyberslash.cr.yp.to/) attack demonstrated how division instructions in post-quantum cryptographic implementations could be exploited to recover secret keys.

## Features

- **Multi-language support**: C, C++, Go, Rust, PHP, JavaScript, TypeScript, Python, Ruby
- **Multi-architecture support**: x86_64, ARM64, ARM, RISC-V, PowerPC, s390x, i386
- **Multi-compiler support**: GCC, Clang, Go compiler, Rustc
- **Scripting language support**: PHP (VLD/opcache), JavaScript/TypeScript (V8 bytecode), Python (dis), Ruby (YARV)
- **Optimization-level testing**: Test across O0-O3, Os, Oz
- **Multiple output formats**: Text, JSON, GitHub Actions annotations
- **Cross-compilation**: Analyze code for different target architectures

## Quick Start

```bash
# Install
uv pip install -e .

# Analyze a C file
ct-analyzer crypto.c
```

## Usage

### Basic Analysis

```bash
ct-analyzer <source_file>
```

### Options

| Option | Description |
|------MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY. NEXT AVAILABLE IN  20 HOURS 43 MINUTES 36 SECONDS VISIT HTTPS://MYMEMORY.TRANSLATED.NET/DOC/USAGELIMITS.PHP TO TRANSLATE MORE