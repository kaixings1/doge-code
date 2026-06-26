---
name: cpp-modern
description: 现代 C++（C++11/14/17/20/23）核心特性指南，包括智能指针、移动语义、lambda、concepts、ranges、coroutines、modules。当用户使用现代 C++ 语法、STL 容器或要求 C++ 最佳实践时使用。
---
# Modern C++ Development ## Core Modern C++ Features
- **C++11**: auto, decltype, move semantics, perfect forwarding, lambda, variadic templates, nullptr, constexpr, smart pointers (unique_ptr, shared_ptr, weak_ptr), unordered containers, random
- **C++14**: generic lambdas, constexpr extensions, return type deduction, std::make_unique, binary literals
- **C++17**: structured bindings, if constexpr, fold expressions, std::optional, std::variant, std::any, string_view, filesystem
- **C++20**: concepts, ranges, coroutines, modules, three-way comparison (<=>), constexpr containers, format, span
- **C++23**: std::optional monadic operations, std::expected, std::print, flat_map, generator, stacktrace ## Smart Pointers & RAII
- Use `std::unique_ptr` for exclusive ownership
- Use `std::shared_ptr` for shared ownership (avoid cycles with weak_ptr)
- Prefer `std::make_unique` and `std::make_shared` over raw new
- RAII: resource acquisition is initialization — use constructors/destructors ## Move Semantics
- Implement move constructor/assignment for performance-critical types
- Mark as noexcept for optimal standard library interaction
- Use std::move for expiring values, std::forward for perfect forwarding
