---
name: cpp-modern
description: 现代 C++（C++11/14/17/20/23）核心特性指南，包括智能指针、移动语义、lambda、concepts、ranges、coroutines、modules。当用户使用现代 C++ 语法、STL 容器或要求 C++ 最佳实践时使用。
---
# 现代 C++ 开发
## 核心现代 C++ 特性
- **C++11**：auto、decltype、移动语义、完美转发、lambda、可变参数模板、nullptr、constexpr、智能指针（unique_ptr、shared_ptr、weak_ptr）、无序容器、random
- **C++14**：泛型 lambda、constexpr 扩展、返回类型推导、std::make_unique、二进制字面量
- **C++17**：结构化绑定、if constexpr、折叠表达式、std::optional、std::variant、std::any、string_view、filesystem
- **C++20**：concepts、ranges、coroutines、modules、三路比较（<=>）、constexpr 容器、format、span
- **C++23**：std::optional 单子操作、std::expected、std::print、flat_map、generator、stacktrace
## 智能指针与 RAII
- 使用 `std::unique_ptr` 实现独占所有权
- 使用 `std::shared_ptr` 实现共享所有权（用 weak_ptr 避免循环）
- 优先使用 `std::make_unique` 和 `std::make_shared` 而非裸 new
- RAII：资源获取即初始化——使用构造函数/析构函数
## 移动语义
- 为性能关键类型实现移动构造函数/赋值
- 标记为 noexcept 以实现最佳标准库交互
- 对过期值使用 std::move，对完美转发使用 std::forward
