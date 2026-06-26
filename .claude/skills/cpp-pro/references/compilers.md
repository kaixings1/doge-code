# C++ Compilers

Guide to major C++ compilers, their differences, and writing portable code.

## Major Compilers Overview

| Compiler | Platform | Standard Compliance | Strengths |
|----------|----------|-------------------|-----------|
| **GCC** | Linux, macOS, Windows (WSL) | Excellent | Open source, wide platform support |
| **Clang** | All major platforms | Excellent | Great diagnostics, modular |
| **MSVC** | Windows | Good | Windows integration, debugging |
| **ICC** | Linux, Windows | Good | Vectorization, Intel optimizations |
| **NVCC** | All | CUDA-specific | GPU compilation |

## GCC (GNU Compiler Collection)

### Version and Standard Flags

```bash
# C++ standard
g++ -std=c++17 file.cc
g++ -std=c++20 file.cc
g++ -std=c++2b file.cc  # C++23

# Common flags
g++ -Wall -Wextra -Wpedantic -O2 -g
```

### GCC-Specific Extensions

```cpp
// Built-in functions
__builtin_expect(expr, value)  // Branch prediction hint
__builtin_prefetch(addr)      // Prefetch memory

// Likely/unlikely
#define likely(x) __builtin_expect(!!(x), 1)
#define unlikely(x) __builtin_expect(!!(x), 0)

if (unlikely(error)) {
    handle_error();
}

// Type-generic math (via __builtin)
auto x = __builtin_sin(3.14);  // Uses double

// Static assertions with messages
static_assert(condition, "message");
```

### GCC Attributes

```cpp
// Likely/unlikely
[[likely]] void hot_path();
[[unlikely]] void cold_path();

// Deprecated
[[deprecated("Use new_function instead")]] void old_function();

// Noreturn
[[noreturn]] void fatal_error();

// Cleanup
struct FileWrapper {
    FILE* f;
    [[gnu::cleanup(close_file)]] void close() { if (f) fclose(f); }
};
```

## Clang

### Clang-Specific Features

```bash
# Clang-specific warnings
clang++ -Weverything -Wno-padded -Wno-c++98-compat

# Modules
clang++ -fmodules -fmodules-cache-path=./module-cache
```

### Clang Attributes

```cpp
// Clang-specific
[[clang::optnone]] void no_inline();  // Disable optimization

// Vector math
[[clang::vector_size(16)]] float simd_float4[4];

// Preserve all comments
[[clang::preserve_most]] void preserve_comments();
```

### Better Diagnostics

```cpp
// Clang provides detailed suggestions
int* p = new int[10];
delete p;  // Warning: delete called on pointer, did you mean delete[]?

// Fix-it hints included in output
```

## MSVC (Microsoft Visual C++)

### MSVC Flags

```bash
# Standard
cl /std:c++17 /EHsc file.cpp

# Warnings
cl /W4 /permissive- file.cpp

# Optimization
cl /O2 /Oi /Ot file.cpp
```

### MSVC Extensions

```cpp
// __declspec
__declspec(dllexport) void export_function();
__declspec(dllimport) void import_function();
__declspec(noinline) void dont_inline();
__declspec(noreturn) void exit_func();
__declspec(align(16)) struct Aligned {};

// Property (C++/CLI extension, not standard C++)
struct Foo {
    int get_x() const { return x_; }
    void set_x(int v) { x_ = v; }
    __declspec(property(get=get_x, put=set_x)) int x;
};
```

### MSVC-Specific Pragmas

```cpp
#pragma once  // Include guard alternative
#pragma warning(push)
#pragma warning(disable: 4996)  // Disable specific warning
#pragma warning(pop)

#pragma comment(lib, "library.lib")  // Link library

#pragma pack(push, 1)  // Packed struct
struct Packed { char a; int b; };
#pragma pack(pop)
```

## Portable Code Patterns

### Detecting Compiler

```cpp
#if defined(__GNUC__)
    #define COMPILER_GCC
#elif defined(__clang__)
    #define COMPILER_CLANG
#elif defined(_MSC_VER)
    #define COMPILER_MSVC
#elif defined(__INTEL_COMPILER)
    #define COMPILER_ICC
#endif

// C++ standard version
#if __cplusplus >= 202002L
    #define CXX_STD 20
#elif __cplusplus >= 201703L
    #define CXX_STD 17
#elif __cplusplus >= 201402L
    #define CXX_STD 14
#else
    #define CXX_STD 11
#endif
```

### Portable Attributes

```cpp
// C++17 standard attributes (portable)
[[nodiscard]] int compute();       // Warn if unused
[[maybe_unused]] void unused();     // Suppress unused warning
[[deprecated]] void old_func();     // Mark as deprecated

// Compiler-specific with fallbacks
#if defined(__GNUC__) || defined(__clang__)
    #define HOT_PATH [[gnu::hot]]
#elif defined(_MSC_VER)
    #define HOT_PATH __declspec(code_seg("TEXT"))
#else
    #define HOT_PATH
#endif
```

### Portable Math

```cpp
#include <cmath>
#include <complex>

// Use standard library - portable
std::sqrt(x);
std::sin(x);
std::pow(x, y);

// Avoid compiler-specific intrinsics
#if defined(__GNUC__) || defined(__clang__)
    #include <x86intrin.h>
#elif defined(_MSC_VER)
    #include <intrin.h>
#endif
```

### Portable Inline Assembly

```cpp
// Use compiler intrinsics instead of inline asm
#include <emmintrin.h>  // SSE2

__m128i a = _mm_load_si128(ptr);
__m128i b = _mm_add_epi32(a, a);

// Or use portable SIMD libraries
#include <vector>
std::transform(v1.begin(), v1.end(), v2.begin(), v1.begin(), std::plus<>());
```

### Portable Typenames

```cpp
// Fixed-width integers - portable
#include <cstdint>
int64_t large_number;
int32_t signed_32;

// Size-specific
#include <cstddef>
size_t size;  // unsigned, platform-appropriate
ptrdiff_t diff;  // signed, platform-appropriate

// Avoid
// int - size varies! Use int32_t or int64_t explicitly
```

### Portable Alignment

```cpp
#include <alignas>

// C++11 alignas - portable
struct alignas(16) Aligned16 {
    float data[4];
};

struct alignas(64) CacheLine {
    // Cache-line aligned
};

// alignas with MSVC
#if defined(_MSC_VER)
    #define CACHE_ALIGN __declspec(align(64))
#else
    #define CACHE_ALIGN alignas(64)
#endif
```

## Compiler Differences

### Name Mangling

```cpp
// Different name mangling schemes
// GCC/Clang: _Z4funcv
// MSVC: ?func@@YAXXZ

// Use extern "C" for C linkage
extern "C" void c_function();

// C++ with extern "C++"
extern "C++" {
    void cpp_function();
}
```

### Exception Handling

```cpp
// MSVC uses different SEH
try {
    // Code
} catch (std::exception& e) {
    // MSVC: also catches hardware exceptions
}

// Portable: disable exceptions
#if defined(_MSC_VER)
    #pragma warning(disable: 4530)
    #define _HAS_EXCEPTIONS 0
#endif
```

### Template Instantiation

```cpp
// GCC/Clang: extern templates
extern template class std::vector<int>;

// MSVC: explicit instantiation
template class std::vector<int>;
```

## Performance Differences

### Inlining

```cpp
// MSVC is aggressive with __forceinline
__forceinline int fast_add(int a, int b) { return a + b; }

// GCC/Clang
inline int fast_add(int a, int b) { return a + b; }

// Portable
#if defined(_MSC_VER)
    #define FORCEINLINE __forceinline
#else
    #define FORCEINLINE inline __attribute__((always_inline))
#endif
```

### Vectorization

```cpp
// MSVC: /fp:fast for fast math
// GCC/Clang: -ffast-math

// Portable SIMD
#include <vector>
std::transform(v.begin(), v.end(), v.begin(), 
    [](float x) { return x * 2.0f; });  // May auto-vectorize
```

## Debugging Across Compilers

### MSVC-Specific

```cpp
// Debug heap (MSVC)
#if defined(_MSC_VER) && defined(_DEBUG)
    #define _CRTDBG_MAP_ALLOC
    #include <crtdbg.h>
    #define new new(_NORMAL_BLOCK, __FILE__, __LINE__)
#endif
```

## Best Practices

1. **Use standard C++** - Avoid compiler-specific features
2. **Test on multiple compilers** - Catch portability issues
3. **CI with multiple compilers** - GitHub Actions with GCC, Clang, MSVC
4. **Warn on all** - Enable maximum warnings on all compilers
5. **Use portable libraries** - STL, Boost over custom code

## Resources

- [GCC Documentation](https://gcc.gnu.org/onlinedocs/)
- [Clang Documentation](https://clang.llvm.org/docs/)
- [MSVC Documentation](https://docs.microsoft.com/en-us/cpp/overview/visual-cpp-in-visual-studio)
