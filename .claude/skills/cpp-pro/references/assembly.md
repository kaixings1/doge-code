# Assembly Integration

Guide to integrating inline assembly and intrinsics across different compilers and architectures.

## Inline Assembly

### GCC/Clang Inline Assembly

```cpp
// Basic inline assembly
int add(int a, int b) {
    int result;
    asm volatile (
        "addl %1, %0"
        : "=r" (result)
        : "r" (a), "0" (b)
    );
    return result;
}

// With constraints
int mul(int a, int b) {
    int result, tmp;
    asm (
        "imull %2, %0"
        : "=r" (result), "=&r" (tmp)
        : "r" (a), "r" (b)
    );
    return result;
}
```

### Constraint Codes

| Constraint | Meaning |
|------------|---------|
| `r` | General register |
| `=r` | Output, general register |
| `0` | Same as operand 0 |
| `i` | Immediate integer |
| `m` | Memory operand |
| `I` | Immediate 0-31 |

### MSVC Inline Assembly

```cpp
// x86 only
int add(int a, int b) {
    __asm {
        mov eax, a
        add eax, b
        mov result, eax
    }
}

// MASM-style
int mul(int a, int b) {
    int result;
    __asm mov eax, a
    __asm imul eax, b
    __asm mov result, eax
    return result;
}
```

## Intrinsics

### x86/x64 Intrinsics

```cpp
#include <immintrin.h>

// MMX (64-bit)
__m64 mm_a, mm_b;
__m64 mm_result = _m_paddb(mm_a, mm_b);  // Packed add bytes

// SSE (128-bit floats)
__m128 sse_a, sse_b;
__m128 sse_result = _mm_add_ps(sse_a, sse_b);  // Add packed floats

// AVX (256-bit)
__m256 avx_a, avx_b;
__m256 avx_result = _mm256_add_ps(avx_a, avx_b);

// AVX-512 (512-bit)
__m512 avx512_a, avx512_b;
__m512 avx512_result = _mm512_add_ps(avx512_a, avx512_b);
```

### ARM NEON Intrinsics

```cpp
#include <arm_neon.h>

// 128-bit vectors
float32x4_t a, b;
float32x4_t result = vaddq_f32(a, b);

// Integer
int32x4_t ia, ib;
int32x4_t result_i = vaddq_s32(ia, ib);

// Lane operations
float32x4_t broadcast = vdupq_n_f32(3.14f);  // All lanes = 3.14

// Extract lane
float element = vgetq_lane_f32(a, 0);  // Lane 0
```

### Intrinsics by Operation

```cpp
// Load/Store
__m128 load = _mm_load_ps(aligned_ptr);
__m128 loadu = _mm_loadu_ps(unaligned_ptr);
_mm_store_ps(aligned_ptr, value);
_mm_storeu_ps(unaligned_ptr, value);

// Arithmetic
__m128 sum = _mm_add_ps(a, b);
__m128 diff = _mm_sub_ps(a, b);
__m128 prod = _mm_mul_ps(a, b);
__m128 div = _mm_div_ps(a, b);

// Comparison
__m128 mask = _mm_cmplt_ps(a, b);  // a < b

// Blend/Select
__m128 result = _mm_blendv_ps(a, b, mask);

// Horizontal operations
__m128 hadd = _mm_hadd_ps(a, b);

// Square root
__m128 sqrt_val = _mm_sqrt_ps(a);

// Maximum/Minimum
__m128 max_val = _mm_max_ps(a, b);
__m128 min_val = _mm_min_ps(a, b);

// Cast
__m128i int_vec = _mm_castps_si128(float_vec);
__m128 float_vec = _mm_castsi128_ps(int_vec);
```

## Portable SIMD Libraries

### std::simd (C++26)

```cpp
#include <simd>

// Portable across architectures
std::simd<float, 4> a = {1, 2, 3, 4};
std::simd<float, 4> b = {5, 6, 7, 8};

auto c = a + b;  // {6, 8, 10, 12}

// Convert between types
std::simd<int, 4> i = std::bit_cast<std::simd<int, 4>>(a);
```

### Highway (Google)

```cpp
#include <hwy/highway.h>

using namespace hwy;

void process(float* data, size_t n) {
    using V = ScalableTag<float>;
    size_t num_lanes = Lanes(V());
    
    for (size_t i = 0; i < n; i += num_lanes) {
        V a = LoadN(V(), data + i, n - i);
        V b = Add(a, a);
        StoreN(b, data + i, n - i);
    }
}
```

### Agner Fog's VCL

```cpp
#include "vectorclass.h"

void process(float* data, size_t n) {
    for (size_t i = 0; i < n; i += 4) {
        Vec4f a = Vec4f().load(data + i);
        Vec4f b = a * a;
        b.store(data + i);
    }
}
```

## Custom Assembly Functions

### Assembly Files

```asm
# add.asm (NASM syntax)
section .text
    global add_numbers
add_numbers:
    mov eax, edi      ; First argument in rdi (x86-64)
    add eax, esi      ; Second argument in rsi
    ret               ; Return in eax
```

```cpp
// C++ declaration
extern "C" int add_numbers(int a, int b);
```

### Linking Assembly

```bash
# NASM + GCC/Clang
nasm -f elf64 add.asm -o add.o
g++ main.cpp add.o -o program

# MASM + MSVC
ml64 add.asm /Fo:add.obj
cl /EHsc main.cpp add.obj
```

## CPU Feature Detection

### Runtime Detection

```cpp
#include <cpuid.h>

bool has_avx2() {
    __cpuidex(info, 7, 0);
    return (info[1] & (1 << 5)) != 0;  // EBX bit 5
}

bool has_avx512() {
    __cpuidex(info, 7, 0);
    return (info[1] & (1 << 16)) != 0;  // EBX bit 16
}

// Portable using std::hardware_destructive_interference_size
constexpr size_t cache_line = std::hardware_destructive_interference_size;
```

### Compile-Time Detection

```cpp
// GCC/Clang
#if defined(__AVX2__)
    // Use AVX2
#elif defined(__SSE4_1__)
    // Use SSE4
#else
    // Scalar fallback
#endif

// MSVC
#if defined(_M_X64) && defined(_M_AMD64)
    #if _M_AMD64 >= 7000  // Zen
    #endif
#endif
```

## SIMD for Different Architectures

### Vector Widths

| Architecture | Vector Width |
|-------------|-------------|
| SSE | 128-bit (4× float) |
| AVX | 256-bit (8× float) |
| AVX-512 | 512-bit (16× float) |
| NEON | 128-bit (4× float) |

### Portable Strategy

```cpp
template<typename T>
void process_impl(T* data, size_t n, std::true_type /* has SIMD */) {
    // Use intrinsics
    for (size_t i = 0; i < n; i += vector_width) {
        // SIMD ops
    }
}

template<typename T>
void process_impl(T* data, size_t n, std::false_type /* no SIMD */) {
    // Scalar fallback
    for (size_t i = 0; i < n; ++i) {
        data[i] *= 2;
    }
}

template<typename T>
void process(T* data, size_t n) {
    if constexpr (has_simd<T>) {
        process_impl(data, n, std::true_type{});
    } else {
        process_impl(data, n, std::false_type{});
    }
}
```

## Best Practices

1. **Use intrinsics** - Over inline assembly for portability
2. **Detect at runtime** - CPU features, choose algorithm
3. **Fallbacks** - Always provide scalar alternatives
4. **Profile** - Measure before optimizing
5. **Test on all architectures** - x86, ARM, etc.

## Resources

- [Intel Intrinsics Guide](https://software.intel.com/sites/landingpage/IntrinsicsGuide/)
- [ARM NEON Intrinsics](https://developer.arm.com/architectures/instruction-sets/simd-isas/neon/intrinsics)
- [Agner Fog's VCL](https://github.com/vectorclass)
- [Google Highway](https://github.com/google/highway)
