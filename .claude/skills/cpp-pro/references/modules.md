# C++20 Modules

Guide to using C++20 modules for improved compilation times and better encapsulation.

## Module Basics

### Advantages

- **Faster compilation** - No re-processing headers
- **Better encapsulation** - Export only what you want
- **No macros leaking** - Proper isolation
- **Ordered independence** - No include order issues

### Module Declaration

```cpp
// math.ixx (module interface)
export module math;

export int add(int a, int b) {
    return a + b;
}

export constexpr double PI = 3.14159265358979;

// Non-exported (internal)
namespace detail {
    int internal_helper() { return 42; }
}
```

### Importing Modules

```cpp
// main.cpp
import math;

int main() {
    int result = add(1, 2);
    // detail::internal_helper() - NOT accessible!
    return 0;
}
```

## Module Partitions

### Interface Partitions

```cpp
// math.core.ixx - Core functionality
export module math.core;

export int add(int a, int b);
export int multiply(int a, int b);

// math.ixx - Main interface
export module math;

export import math.core;  // Re-export

export double square(double x);
```

### Implementation Partitions

```cpp
// math.impl.ixx - Implementation
module math.core;

int add(int a, int b) { return a + b; }
int multiply(int a, int b) { return a * b; }
```

## Module Structure

### Traditional vs Module

```cpp
// Header: utils.h
#ifndef UTILS_H
#define UTILS_H

int add(int a, int b);  // Declaration

#endif

// Module: utils.ixx
export module utils;

export int add(int a, int b) {  // Definition
    return a + b;
}
```

### Global Module Fragment

```cpp
module;

// Includes still work for compatibility
#include <vector>
#include <string>

export module mymodule;

// Uses types from headers
export void process(const std::vector<std::string>& items);
```

## Private Module Fragment

```cpp
module;

// Private implementation details
#include "pch.h"

export module widget;

// Public interface
export class Widget {
public:
    void draw();
    int get_id() const { return id_; }
    
private:
    int id_ = 0;
};

// Private implementation (not exported)
module :private;

void helper() {
    // Implementation detail
}
```

## CMake Integration

### Building Modules

```cmake
# CMake 3.28+ supports C++ modules
cmake_minimum_required(VERSION 3.28)
project(MyProject)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_MODULES on)

add_executable(myapp
    main.cpp
    math.ixx
)
```

### MSVC Support

```cmake
# MSVC requires BMI generation
add_executable(myapp
    main.cpp
    math.ixx
)

# MSVC specific
if(MSVC)
    set_source_files_properties(math.ixx
        PROPERTIES
        CXX_MODULE_STANDARD "20"
    )
endif()
```

## Mixing Headers and Modules

### Hybrid Approach

```cpp
// Can still use headers for third-party
#include <fmt/format.h>

export module mylib;

export void print_hello() {
    fmt::print("Hello, {}!\n", "world");
}
```

## Best Practices

1. **Start with module partitions** - For large codebases
2. **Use .ixx extension** - Standard C++ module files
3. **Separate interface/implementation** - For compilation speed
4. **Keep headers for compatibility** - While migrating

## Current Support

| Compiler | Module Support |
|----------|---------------|
| Clang 16+ | Full |
| MSVC 19.29+ | Full |
| GCC 14+ | Partial |

## Resources

- [C++20 Modules - ISO](https://www.open-std.org/jtc1/sc22/wg21/docs/papers/2019/n4721.html)
- [Modules Tutorial - Microsoft](https://learn.microsoft.com/en-us/cpp/cpp/modules-cpp)
