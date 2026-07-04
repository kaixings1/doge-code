---
name: cpp-performance
description: C++ 性能优化技能，涵盖 CPU/GPU 分析、SIMD、缓存友好设计、零成本抽象、内存优化、并行计算。当用户需要优化 C++ 代码性能、减少延迟、降低内存占用或进行性能分析时使用。
---
# C++ 性能优化
## 性能分析
- **CPU**：perf（Linux）、Instruments（macOS）、VTune（Windows）、Tracy
- **内存**：Heaptrack、Massif、MTuner
- **GPU**：Nsight Compute/CUDA、RenderDoc
## 性能模式
- 缓存友好：连续内存（vector > list）、SoA vs AoS
- 移动语义：避免拷贝，对大对象使用 std::move
- SSO/SOO：小字符串优化、小向量优化
- 编译时：constexpr、模板、static_assert、CRTP
## SIMD
- 自动向量化：简单循环、-O2 -march=native
- 显式：SSE/AVX 内联函数、std::experimental::simd (C++26)
- Google Highway：跨架构可移植 SIMD
## 并发
- std::async、std::thread、std::jthread (C++20)
- TBB、OpenMP 用于并行循环
- 无锁：std::atomic、std::memory_order（仅限专家）
