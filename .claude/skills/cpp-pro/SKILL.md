---
name: cpp-pro
description: 专家级 C++ 开发技能，融合现代 C++（C++11-C++23）、Google 风格指南、智能指针、模板/元编程、xmake 构建系统、代码审查、调试和性能优化。用于：任何 C++ 开发任务，包括架构设计、实现、代码审查、构建设置、调试、优化、模板、RAII、单元测试和跨平台开发。
---

# C++ Professional Development Skill

This skill provides comprehensive C++ expertise covering modern C++11-C++23, Google C++ Style Guide, xmake build systems, smart pointers, RAII, templates, metaprogramming, code review, debugging, profiling, and performance optimization. Think and act like a 10-year senior Google engineer.

## Core Philosophy

1. **Optimize for the reader** - Code is read 10x more than written
2. **Be consistent** - Follow existing patterns in the codebase
3. **Be explicit** - Clear intent over clever shortcuts
4. **Use modern C++** - Leverage C++11-23 features for safety and performance
5. **Zero-cost abstractions** - High-level code should not add runtime overhead
6. **Test everything** - Unit tests are not optional

## Build System - xmake

**ALWAYS use xmake for build systems unless user explicitly requests another.**

When the user mentions build, compilation, linking, project setup, or any build-related task, invoke the xmake-pro skill first:

```
Use xmake-pro skill for: xmake build configuration, cross-compilation, testing setup, package management, and professional build workflows.
```

### Quick xmake Integration

For simple projects, you can create basic xmake compilation commands:

```lua
-- xmake compilation.lua
target("myapp")
    set_kind("binary")
    add_files("src/*.cc")
    add_includedirs("include")
    set_languages("c++20")

target("mylib")
    set_kind("static")
    add_files("lib/*.cc")
    set_languages("c++20")
```

```bash
# Compile
xmake build myapp

# Run tests
xmake test

# Cross-compile
xmake config --plat=android --arch=arm64
xmake build
```

## Modern C++ Features (C++11-C++23)

### Auto Type Deduction

```cpp
// Prefer auto for complex types
auto it = vec.begin();
auto map_it = mymap.find("key");
auto lambda = [](int x) { return x * 2; };

// Use auto with initialization for clarity
auto value = 42;              // int
auto pi = 3.14;              // double
auto name = std::string("Alice");
```

### Range-Based For Loops

```cpp
// Use const reference when not modifying
for (const auto& item : container) {
    process(item);
}

// Use reference when modifying
for (auto& item : container) {
    item.modify();
}
```

### Lambda Expressions

```cpp
// Basic lambda
auto add = [](int a, int b) { return a + b; };

// Captures
int multiplier = 10;
auto multiply = [multiplier](int x) { return x * multiplier; };
auto increment = [&counter]() { counter++; };

// Generic lambda (C++14)
auto generic_add = [](auto a, auto b) { return a + b; };

// Init captures (C++14) - move-only types
auto ptr = std::make_unique<int>(42);
auto lambda = [p = std::move(ptr)]() { return *p; };

// C++23: deducing this
auto fibonacci = [](this auto self, int n) -> int {
    if (n <= 1) return n;
    return self(n-1) + self(n-2);
};
```

### Structured Bindings (C++17)

```cpp
// Pairs and tuples
auto [id, name] = get_data();

// Maps
for (const auto& [key, value] : mymap) {
    process(key, value);
}

// Arrays
int arr[3] = {1, 2, 3};
auto [a, b, c] = arr;
```

### If Constexpr (C++17)

```cpp
template<typename T>
auto process(T value) {
    if constexpr (std::is_integral_v<T>) {
        return value * 2;
    } else if constexpr (std::is_floating_point_v<T>) {
        return value * 3.14;
    }
}
```

### Fold Expressions (C++17)

```cpp
template<typename... Args>
auto sum(Args... args) {
    return (args + ...);
}

template<typename... Args>
void print(Args... args) {
    (std::cout << ... << args) << '\n';
}
```

### Concepts (C++20)

```cpp
#include <concepts>

template<typename T>
concept Numeric = std::integral<T> || std::floating_point<T>;

template<Numeric T>
T add(T a, T b) {
    return a + b;
}

// Multiple constraints
template<typename T>
concept Sortable = std::copyable<T> && requires(T a, T b) {
    { a < b } -> std::convertible_to<bool>;
};
```

### Ranges (C++20)

```cpp
#include <ranges>

auto result = numbers
    | std::views::filter([](int n) { return n % 2 == 0; })
    | std::views::transform([](int n) { return n * n; });

// Take, drop, reverse
auto first_five = numbers | std::views::take(5);
auto reversed = numbers | std::views::reverse;
```

### Coroutines (C++20)

```cpp
#include <coroutine>

struct Generator {
    struct promise_type {
        int current_value;
        Generator get_return_object() {
            return Generator{std::coroutine_handle<promise_type>::from_promise(*this)};
        }
        std::suspend_always initial_suspend() { return {}; }
        std::suspend_always final_suspend() noexcept { return {}; }
        std::suspend_always yield_value(int value) {
            current_value = value;
            return {};
        }
        void return_void() {}
        void unhandled_exception() {}
    };
    std::coroutine_handle<promise_type> handle;
    // ... supporting code
};

Generator counter(int start, int end) {
    for (int i = start; i < end; ++i) {
        co_yield i;
    }
}
```

### Three-Way Comparison (C++20)

```cpp
struct Point {
    int x, y;
    auto operator<=>(const Point&) const = default;
};

struct Person {
    std::string name;
    int age;
    auto operator<=>(const Person& other) const {
        if (auto cmp = name <=> other.name; cmp != 0) return cmp;
        return age <=> other.age;
    }
};
```

### Std::expected (C++23)

```cpp
#include <expected>

std::expected<int, std::string> divide(int a, int b) {
    if (b == 0) return std::unexpected("Division by zero");
    return a / b;
}

auto result = divide(10, 2);
if (result) {
    std::cout << *result << '\n';
} else {
    std::cerr << result.error() << '\n';
}
```

## Smart Pointers and RAII

### RAII Principles

```cpp
// RAII wrapper for file
class FileHandle {
    std::unique_ptr<std::FILE, decltype(&std::fclose)> file_;
public:
    FileHandle(const char* filename, const char* mode)
        : file_(std::fopen(filename, mode), &std::fclose) {
        if (!file_) throw std::runtime_error("Failed to open");
    }
    std::FILE* get() { return file_.get(); }
};
```

### unique_ptr - Exclusive Ownership

```cpp
// Prefer make_unique
auto w = std::make_unique<Widget>(id);

// Release ownership
Widget* raw = w.release();

// Reset to new object
w.reset(new Widget(id));

// Move ownership
auto w2 = std::move(w);

// Custom deleter
auto deleter = [](FILE* fp) { fclose(fp); };
std::unique_ptr<FILE, decltype(deleter)> file(fopen("data.txt", "r"), deleter);
```

### shared_ptr - Shared Ownership

```cpp
auto shared = std::make_shared<Resource>(id);
auto copy = shared;  // Reference count incremented

// Aliasing constructor
std::shared_ptr<int> px(data, &data->x);

// Thread-safe reference counting
```

### weak_ptr - Non-Owning References

```cpp
// Break circular references
class Parent {
    std::weak_ptr<Child> child_;  // weak_ptr breaks cycle
public:
    std::shared_ptr<Child> get_child() const { return child_.lock(); }
};

// Observer pattern
class Observable {
    std::vector<std::weak_ptr<Observer>> observers_;
public:
    void notify() {
        observers_.erase(
            std::remove_if(observers_.begin(), observers_.end(),
                [](const auto& w) { return w.expired(); }),
            observers_.end());
        for (auto& w : observers_) {
            if (auto o = w.lock()) o->on_notify();
        }
    }
};
```

### enable_shared_from_this

```cpp
class Task : public std::enable_shared_from_this<Task> {
public:
    void depends_on(std::shared_ptr<Task> other) {
        other->add_dependency(shared_from_this());
    }
};
```

## Move Semantics

```cpp
class Buffer {
    char* data_;
    size_t size_;
public:
    // Move constructor
    Buffer(Buffer&& other) noexcept 
        : data_(other.data_), size_(other.size_) {
        other.data_ = nullptr;
        other.size_ = 0;
    }
    
    // Move assignment
    Buffer& operator=(Buffer&& other) noexcept {
        if (this != &other) {
            delete[] data_;
            data_ = other.data_;
            size_ = other.size_;
            other.data_ = nullptr;
            other.size_ = 0;
        }
        return *this;
    }
};

// Perfect forwarding
template<typename T>
void wrapper(T&& arg) {
    process(std::forward<T>(arg));
}
```

## Templates and Metaprogramming

### Function Templates

```cpp
template<typename T>
T maximum(T a, T b) { return (a > b) ? a : b; }

template<typename T, typename U>
auto add(T a, U b) -> decltype(a + b) { return a + b; }

template<typename T, size_t N>
size_t array_size(T (&)[N]) { return N; }
```

### Class Templates

```cpp
template<typename T>
class Stack {
    T* data_;
    size_t size_, capacity_;
public:
    void push(const T& value);
    T pop();
    bool empty() const { return size_ == 0; }
};
```

### Template Specialization

```cpp
template<typename T>
class Container {
    T value_;
public:
    void print() const { std::cout << value_ << '\n'; }
};

template<>
class Container<const char*> {
    const char* value_;
public:
    void print() const { std::cout << "C-string: " << value_ << '\n'; }
};
```

### SFINAE

```cpp
template<typename T>
typename std::enable_if_t<std::is_arithmetic<T>::value>
print_value(T value) {
    std::cout << "Number: " << value << '\n';
}

template<typename T>
typename std::enable_if_t<!std::is_arithmetic<T>::value>
print_value(const T& value) {
    std::cout << "Non-number\n";
}
```

### Variadic Templates

```cpp
template<typename... Args>
auto sum(Args... args) { return (args + ...); }

template<typename... Args>
void print(Args... args) { (std::cout << ... << args) << '\n'; }
```

### Type Traits

```cpp
template<typename T>
void process(const T& value) {
    if constexpr (std::is_integral_v<T>) {
        // Integer handling
    } else if constexpr (std::is_floating_point_v<T>) {
        // Float handling
    }
}

// Type transformations
using NoCV = std::remove_cv_t<T>;
using NoRef = std::remove_reference_t<T>;
using AddPtr = std::add_pointer_t<T>;
```

## Google C++ Style Guide

### Naming Conventions

| Entity | Convention | Example |
|--------|------------|---------|
| Files | snake_case | `my_class.cc`, `http_parser.h` |
| Classes | PascalCase | `MyClass`, `UrlParser` |
| Functions | PascalCase | `ProcessData()`, `GetValue()` |
| Accessors | snake_case | `count()`, `set_count()` |
| Variables | snake_case | `table_name`, `num_items` |
| Class members | snake_case_ | `value_`, `data_map_` |
| Constants | kPascalCase | `kMaxSize`, `kPi` |
| Enumerators | kPascalCase | `kOk`, `kNotFound` |
| Macros | UPPER_CASE | `MY_MACRO_`, `DEBUG_LOG_` |
| Namespaces | snake_case | `my_project`, `internal` |

### Headers

```cpp
#ifndef PROJECT_PATH_FILE_H_
#define PROJECT_PATH_FILE_H_

#include "project/public/header.h"

#include <sys/types.h>

#include <string>
#include <vector>

#include "other/library.h"
#include "project/internal.h"

namespace project {

class MyClass {
 public:
  explicit MyClass(int value);
  void DoSomething();
  int count() const { return count_; }
  void set_count(int count) { count_ = count; }

 private:
  int count_ = 0;
};

}  // namespace project

#endif  // PROJECT_PATH_FILE_H_
```

### Include Order

1. Related header (for `.cc` files)
2. C system headers (`<unistd.h>`)
3. C++ standard library (`<string>`, `<vector>`)
4. Other libraries
5. Project headers

### Critical Rules

- **ALWAYS** use `#define` guards
- **ALWAYS** make single-argument constructors `explicit`
- **ALWAYS** use `nullptr` (not `NULL` or `0`)
- **ALWAYS** use `override` or `final` for virtual overrides
- **ALWAYS** declare data members `private` in classes
- **NEVER** use `using namespace` directives
- **NEVER** use C-style casts (use `static_cast`, etc.)
- **NEVER** define macros in headers when possible

### Class Declaration Order

```cpp
class MyClass {
 public:
  using ValueType = int;
  static constexpr int kMaxSize = 100;
  
  MyClass();
  MyClass(const MyClass&) = default;
  MyClass& operator=(const MyClass&) = default;
  ~MyClass();
  
  void Process();

 protected:
  // Protected members

 private:
  void InternalHelper();
  int value_ = 0;
};
```

## Code Review

### Review Checklist

**Naming**
- [ ] Types use `PascalCase`
- [ ] Functions use `PascalCase` (accessors use `snake_case`)
- [ ] Variables use `snake_case`
- [ ] Class members have trailing underscore: `member_`
- [ ] Constants use `kPascalCase`
- [ ] Macros use `UPPER_CASE` with project prefix

**Headers**
- [ ] Has `#define` guard: `PROJECT_PATH_FILE_H_`
- [ ] Self-contained (includes all dependencies)
- [ ] Includes ordered correctly
- [ ] No unnecessary forward declarations

**Classes**
- [ ] Single-argument constructors are `explicit`
- [ ] Data members are `private`
- [ ] Copy/move semantics explicit (= default, = delete)
- [ ] No virtual calls in constructors
- [ ] Uses composition over inheritance when appropriate

**Functions**
- [ ] Returns values instead of output parameters when possible
- [ ] Parameters ordered: inputs before outputs
- [ ] Uses `override`/`final` for virtual overrides

**Modern C++**
- [ ] Uses `nullptr` (not `NULL` or `0`)
- [ ] Uses C++ casts (not C-style)
- [ ] Uses range-based for loops where appropriate
- [ ] Uses `auto` appropriately
- [ ] Smart pointers for ownership

### Feedback Format

Use severity levels:

- 🔴 **MUST FIX**: Style violations or bugs that must be fixed
- 🟡 **SHOULD FIX**: Strong recommendations for improvement  
- 🟢 **CONSIDER**: Optional enhancements or suggestions

## Unit Testing

### GoogleTest Best Practices

```cpp
#include <gtest/gtest.h>

class WidgetTest : public ::testing::Test {
 protected:
  void SetUp() override { widget_ = std::make_unique<Widget>(42); }
  std::unique_ptr<Widget> widget_;
};

TEST_F(WidgetTest, InitialValue) {
  EXPECT_EQ(widget_->value(), 42);
}

TEST_F(WidgetTest, SetValue) {
  widget_->set_value(100);
  EXPECT_EQ(widget_->value(), 100);
}

// Death tests
TEST(DeathTest, InvalidInput) {
  EXPECT_DEATH(Widget(-1), "negative");
}

// Parametrized tests
class MathTest : public ::testing::TestWithParam<int> {};
TEST_P(MathTest, IsPositive) {
  EXPECT_TRUE(GetParam() > 0);
}
INSTANTIATE_TEST_CASE_P(Positive, MathTest, ::testing::Values(1, 2, 3));
```

### Test Coverage Principles

1. Test behavior, not implementation
2. UseArrange-Act-Assert pattern
3. One assertion per test when possible
4. Test edge cases and error conditions
5. Mock external dependencies
6. Keep tests fast and isolated

## Debugging and Profiling

### GDB Commands

```bash
# Basic
gdb ./program
run arg1 arg2
bt              # Backtrace
break function
break file:line
print variable
next / step
continue

# Conditional breakpoints
break foo.c:42 if x > 10

# Watch points
watch variable
awatch variable  # Read or write
rwatch variable  # Read

# Debug core dumps
gdb ./program core
```

### Valgrind Memory Analysis

```bash
valgrind --leak-check=full ./program
valgrind --tool=cachegrind ./program
valgrind --tool=callgrind ./program
```

### Sanitizers

```bash
# Address Sanitizer
g++ -fsanitize=address -g program.cc

# Undefined Behavior Sanitizer  
g++ -fsanitize=undefined program.cc

# Thread Sanitizer
g++ -fsanitize=thread program.cc

# Combined
g++ -fsanitize=address,undefined,thread -g program.cc
```

### Performance Profiling

```bash
# Linux perf
perf record -g ./program
perf report
perf annotate

# gprof
g++ -pg -g program.cc
./program
gprof ./program gmon.out
```

## System Programming

### Threading

```cpp
#include <thread>
#include <mutex>
#include <condition_variable>

std::mutex mtx;
std::condition_variable cv;
bool ready = false;

void worker() {
    std::unique_lock<std::mutex> lock(mtx);
    cv.wait(lock, [] { return ready; });
    // Do work
}

void master() {
    {
        std::lock_guard<std::mutex> lock(mtx);
        ready = true;
    }
    cv.notify_all();
}
```

### Thread-Safe Data Structures

```cpp
#include <shared_mutex>

class ThreadSafeCache {
    mutable std::shared_mutex mtx_;
    std::map<std::string, std::string> data_;
    
public:
    // Multiple readers
    std::string get(const std::string& key) const {
        std::shared_lock<std::shared_mutex> lock(mtx_);
        return data_.at(key);
    }
    
    // Single writer
    void put(const std::string& key, const std::string& value) {
        std::unique_lock<std::shared_mutex> lock(mtx_);
        data_[key] = value;
    }
};
```

### File I/O

```cpp
#include <fstream>

// RAII file handling
{
    std::ifstream file("data.txt");
    std::string content((std::istreambuf_iterator<char>(file)),
                        std::istreambuf_iterator<char>());
}

// Binary I/O
std::ofstream out("data.bin", std::ios::binary);
out.write(reinterpret_cast<const char*>(&data), sizeof(data));
```

### Networking

```cpp
#include <sys/socket.h>
#include <netinet/in.h>

int create_server(int port) {
    int sock = socket(AF_INET, SOCK_STREAM, 0);
    struct sockaddr_in addr = {};
    addr.sin_family = AF_INET;
    addr.sin_port = htons(port);
    addr.sin_addr.s_addr = htonl(INADDR_ANY);
    
    bind(sock, (struct sockaddr*)&addr, sizeof(addr));
    listen(sock, 128);
    return sock;
}
```

## Performance Optimization

### Memory Layout

```cpp
// Cache-friendly: access pattern
for (int i = 0; i < rows; ++i) {
    for (int j = 0; j < cols; ++j) {
        process(matrix[i][j]);  // Row-major
    }
}

// Structure of Arrays (SoA) for SIMD
struct ParticleSystem {
    std::vector<float> pos_x, pos_y, pos_z;
    std::vector<float> vel_x, vel_y, vel_z;
};
```

### Move Semantics for Performance

```cpp
// Return by value enables RVO
std::vector<int> generate_data() {
    std::vector<int> data;
    // ... populate
    return data;  // No copy, no move
}

// Emplace to avoid temporaries
std::vector<std::pair<int, std::string>> vec;
vec.emplace_back(1, "one");  // Construct in-place
```

### Constexpr for Compile-Time

```cpp
constexpr int fibonacci(int n) {
    if (n <= 1) return n;
    return fibonacci(n-1) + fibonacci(n-2);
}

constexpr auto primes = []() {
    std::vector<int> p;
    // Compute primes at compile time
    return p;
}();
```

### Lazy Evaluation

```cpp
template<typename T>
class Lazy {
    std::function<T()> func_;
    mutable std::optional<T> cache_;
public:
    T& get() const {
        if (!cache_) cache_ = func_();
        return *cache_;
    }
};
```

## Common Pitfalls to Avoid

1. **Raw pointers for ownership** - Use smart pointers instead
2. **Missing virtual destructor** - Always add for polymorphic classes
3. **Not using `noexcept` on move operations** - Impacts container performance
4. **Copying large objects** - Use `const&` or move
5. **Using `auto` incorrectly** - Don't hide important type info
6. **Capturing by reference in lambdas** - Risk of dangling references
7. **Thread safety** - Protect shared data with mutexes
8. **Exception safety** - Use RAII, prefer `noexcept` where appropriate
9. **Resource leaks** - Always pair acquire with release
10. **Undefined behavior** - Don't violate C++ rules

## Professional Project Structure

```
project/
├── xmake.lua
├── src/
│   ├── main.cc
│   ├── module/
│   │   ├── module.cc
│   │   └── module.h
│   └── utils/
│       └── utils.h
├── include/
│   └── project/
│       └── public_header.h
├── tests/
│   ├── module_test.cc
│   └── utils_test.cc
├── docs/
│   └── design.md
├── third_party/
│   └── googletest/
└── CMakeLists.txt  # If needed for external builds
```

## Quick Decision Guide

### Which smart pointer?

- **unique_ptr**: Default choice, exclusive ownership
- **shared_ptr**: Shared ownership needed
- **weak_ptr**: Break cycles, observers
- **raw pointer**: Non-owning observation only

### Which container?

- **vector**: Default sequence container
- **deque**: Front insertion + random access
- **list**: Frequent insertion/removal in middle
- **map/set**: Ordered lookup
- **unordered_map/set**: Fast lookup, no ordering

### Pass by?

- **Value**: Small types (int, double, etc.)
- **const&**: Read-only, large objects
- **&**: Output parameters
- **&&**: Move semantics, perfect forwarding

### Return by?

- **Value**: Small objects, enable RVO
- **const&**: Existing objects, read-only
- **&**: Never return references to local temporaries
- **unique_ptr**: Transfer ownership

## References

For detailed information, see bundled references:

### Core Skills
- [modern-cpp.md](references/modern-cpp.md) - Modern C++11-C++23 features (lambdas, move semantics, ranges, concepts, coroutines)
- [smart-pointers.md](references/smart-pointers.md) - RAII, unique_ptr, shared_ptr, weak_ptr
- [templates-metaprogramming.md](references/templates-metaprogramming.md) - Templates, SFINAE, type traits, concepts
- [guidelines.md](references/guidelines.md) - C++ Core Guidelines
- [structure.md](references/structure.md) - Code organization

### Style and Review
- [Google C++ Style Guide](references/) - Complete style guide (headers, naming, classes, functions, formatting)
- [cpp-review](references/) - Code review checklist

### Build System
- [xmake/](references/xmake/) - xmake build system references:
  - basic-commands.md - Essential xmake commands
  - project-structure.md - Project organization
  - package-management.md - Dependency management
  - cross-compilation.md - Cross-platform builds
  - testing.md - Unit test integration
  - ci-cd.md - CI/CD integration
  - advanced-build.md - Build optimization

### Specialized Topics
- [cuda-gpu.md](references/cuda-gpu.md) - CUDA programming, cuBLAS, Thrust, multi-GPU
- [boost.md](references/boost.md) - Boost libraries (optional, containers, algorithms)
- [design-patterns.md](references/design-patterns.md) - Modern C++ design patterns
- [concurrency.md](references/concurrency.md) - Advanced threading, atomics, thread pools
- [networking.md](references/networking.md) - Sockets, HTTP, WebSocket, Boost ASIO
- [database.md](references/database.md) - SQLite, ORM, connection pooling
- [serialization.md](references/serialization.md) - JSON, Protobuf, binary formats
- [logging.md](references/logging.md) - spdlog, glog, structured logging
- [fuzzing.md](references/fuzzing.md) - libfuzzer, AFL++, differential fuzzing
- [cicd.md](references/cicd.md) - GitHub Actions, GitLab CI, Docker, sanitizers

### Advanced Topics
- [stl.md](references/stl.md) - STL deep dive, containers, algorithms, iterators, allocators
- [error-handling.md](references/error-handling.md) - Exceptions, std::error_code, expected, error safety
- [type-erasure.md](references/type-erasure.md) - std::function, std::any, custom type erasure
- [lifetime-ownership.md](references/lifetime-ownership.md) - Object lifetime, ownership, dangling references
- [compile-time.md](references/compile-time.md) - constexpr, consteval, template metaprogramming
- [windows.md](references/windows.md) - Win32 API, COM, ATL, WinRT
- [security.md](references/security.md) - Secure coding, buffer overflows, input validation
- [wasm-web.md](references/wasm-web.md) - WebAssembly, Emscripten, WASI
- [embedded.md](references/embedded.md) - Bare metal, no-std, RTOS, memory-mapped I/O
- [simd.md](references/simd.md) - SIMD intrinsics, vectorization, SSE/AVX/NEON
- [game-engine.md](references/game-engine.md) - ECS, object pools, data-oriented design
- [profiling.md](references/profiling.md) - perf, VTune, Valgrind, hotspot analysis
- [api-design.md](references/api-design.md) - API design principles, versioning, ABI
- [conan-vcpkg.md](references/conan-vcpkg.md) - Conan and vcpkg package managers
- [rust-interop.md](references/rust-interop.md) - C++ ↔ Rust FFI, CXX crate

### Tools and Techniques
- [compilers.md](references/compilers.md) - GCC, Clang, MSVC differences, portable code
- [assembly.md](references/assembly.md) - Inline assembly, intrinsics, SIMD across compilers
- [memory-allocation.md](references/memory-allocation.md) - Pools, arenas, TLSF, custom allocators
- [zero-allocation.md](references/zero-allocation.md) - Zero-allocation patterns, stack containers
- [reading-codebases.md](references/reading-codebases.md) - Navigating unfamiliar codebases
- [documentation.md](references/documentation.md) - Doxygen, Sphinx, Markdown documentation
- [contracts.md](references/contracts.md) - Preconditions, postconditions, invariants
- [coroutines.md](references/coroutines.md) - C++20 coroutines, generators, async/await
- [modules.md](references/modules.md) - C++20 modules, partitions, CMake integration
- [monadic.md](references/monadic.md) - Monadic operations on optional/variant/expected

## When to Use This Skill

Use this skill for:

- Any C++ development task
- Code review requests
- Architecture and design decisions
- Build system configuration
- Debugging and profiling
- Performance optimization
- Template and metaprogramming questions
- Modern C++ migration
- Cross-platform development
- Interview preparation

This skill combines expertise from multiple C++ specialties to provide comprehensive guidance for professional C++ development.
