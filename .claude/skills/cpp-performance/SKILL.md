---
name: cpp-performance
description: C++ 性能优化技能，涵盖 CPU/GPU 分析、SIMD、缓存友好设计、零成本抽象、内存优化、并行计算。当用户需要优化 C++ 代码性能、减少延迟、降低内存占用或进行性能分析时使用。
---
# C++ Performance Optimization ## Profiling
- **CPU**: perf (Linux), Instruments (macOS), VTune (Windows), Tracy
- **Memory**: Heaptrack, Massif, MTuner
- **GPU**: Nsight Compute/CUDA, RenderDoc ## Performance Patterns
- Cache-friendly: contiguous memory (vector > list), SoA vs AoS
- Move semantics: avoid copies, use std::move for large objects
- SSO/SOO: small string optimization, small vector optimization
- Compile-time: constexpr, templates, static_assert, CRTP ## SIMD
- Auto-vectorization: simple loops, -O2 -march=native
- Explicit: SSE/AVX intrinsics, std::experimental::simd (C++26)
- Google Highway: portable SIMD across architectures ## Concurrency
- std::async, std::thread, std::jthread (C++20)
- TBB, OpenMP for parallel loops
- Lock-free: std::atomic, std::memory_order (expert only)
