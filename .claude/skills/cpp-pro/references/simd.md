# SIMD and Vectorization

Guide to SIMD programming in modern C++, covering intrinsics, portable SIMD, and optimization techniques.

## SIMD Basics

SIMD (Single Instruction Multiple Data) processes multiple data elements with one instruction:

```
Without SIMD:  [1,2,3,4] + [5,6,7,8] = [6,8,10,12]  (4 operations)
With SIMD:     [1,2,3,4] + [5,6,7,8] = [6,8,10,12]  (1 operation)
```

## std::simd (C++26)

```cpp
#include <simd>

// Vector of 4 floats
std::simd<float, 4> a = {1.0f, 2.0f, 3.0f, 4.0f};
std::simd<float, 4> b = {5.0f, 6.0f, 7.0f, 8.0f};

// Arithmetic operations
auto c = a + b;  // {6, 8, 10, 12}
auto d = a * b;  // {5, 12, 21, 32}

// Load/store
alignas(16) float data[4];
std::simd<float, 4> v = std::simd<float, 4>::load(data);
v.store(data);

// Reduce
float sum = std::reduce(v, std::plus<>{});  // Sum all elements
```

## Portable SIMD with std::experimental (TS)

```cpp
#include <experimental/simd>

namespace stdx = std::experimental;

// Fixed-size SIMD
stdx::native_simd<float> a = stdx::native_simd<float>::brackets{1, 2, 3, 4};

// Element access
float x = a[0];

// Arithmetic
auto c = a + b;
auto d = a * b;

// Horizontal operations
float sum = stdx::hadd(a);  // Sum all elements
```

## Intel Intrinsics (SSE/AVX)

```cpp
#include <immintrin.h>

// SSE - 128-bit (4 floats)
__m128 add_sse(__m128 a, __m128 b) {
    return _mm_add_ps(a, b);
}

__m128 multiply_sse(__m128 a, __m128 b) {
    return _mm_mul_ps(a, b);
}

// Load aligned (16-byte)
alignas(16) float a[4], b[4];
__m128 va = _mm_load_ps(a);
__m128 vb = _mm_load_ps(b);

// Store aligned
_mm_store_ps(a, result);

// AVX - 256-bit (8 floats)
__m256 add_avx(__m256 a, __m256 b) {
    return _mm256_add_ps(a, b);
}

// AVX2 - 256-bit integer
__m256i add_avx2(__m256i a, __m256i b) {
    return _mm256_add_epi32(a, b);
}

// AVX-512 - 512-bit (16 floats)
__m512 add_avx512(__m512 a, __m512 b) {
    return _mm512_add_ps(a, b);
}
```

## ARM NEON

```cpp
#include <arm_neon.h>

// Float32x4 - 4 floats
float32x4_t a = {1.0f, 2.0f, 3.0f, 4.0f};
float32x4_t b = {5.0f, 6.0f, 7.0f, 8.0f};

float32x4_t c = vaddq_f32(a, b);  // {6, 8, 10, 12}
float32x4_t d = vmulq_f32(a, b);  // {5, 12, 21, 32}

// Integer
int32x4_t ia = {1, 2, 3, 4};
int32x4_t ib = {5, 6, 7, 8};
int32x4_t ic = vaddq_s32(ia, ib);

// Load/store
float32x4_t load = vld1q_f32(data);
vst1q_f32(output, result);
```

## Loop Vectorization

```cpp
#include <vectorization>
#include <cmath>

// Compiler hints for vectorization
void process(float* output, const float* input, size_t n) {
    #pragma omp simd aligned(output, input: 16)
    for (size_t i = 0; i < n; ++i) {
        output[i] = std::sqrt(input[i]) * 2.0f + 1.0f;
    }
}

// Restrict pointers - no aliasing
void compute(float* __restrict__ output, 
            const float* __restrict__ input, 
            size_t n) {
    for (size_t i = 0; i < n; ++i) {
        output[i] = input[i] * 2.0f;
    }
}
```

## Practical Example: Dot Product

```cpp
#include <immintrin.h>

// Scalar baseline
float dot_scalar(const float* a, const float* b, size_t n) {
    float sum = 0.0f;
    for (size_t i = 0; i < n; ++i) {
        sum += a[i] * b[i];
    }
    return sum;
}

// SSE version
float dot_sse(const float* a, const float* b, size_t n) {
    __m128 sum = _mm_setzero_ps();
    
    size_t i = 0;
    for (; i + 4 <= n; i += 4) {
        __m128 av = _mm_loadu_ps(a + i);
        __m128 bv = _mm_loadu_ps(b + i);
        __m128 prod = _mm_mul_ps(av, bv);
        sum = _mm_add_ps(sum, prod);
    }
    
    // Horizontal sum
    alignas(16) float result[4];
    _mm_store_ps(result, sum);
    float final = result[0] + result[1] + result[2] + result[3];
    
    // Tail
    for (; i < n; ++i) {
        final += a[i] * b[i];
    }
    
    return final;
}

// AVX version
float dot_avx(const float* a, const float* b, size_t n) {
    __m256 sum = _mm256_setzero_ps();
    
    size_t i = 0;
    for (; i + 8 <= n; i += 8) {
        __m256 av = _mm256_loadu_ps(a + i);
        __m256 bv = _mm256_loadu_ps(b + i);
        __m256 prod = _mm256_mul_ps(av, bv);
        sum = _mm256_add_ps(sum, prod);
    }
    
    // Reduce to 128 bits
    __m128 lo = _mm256_castps256_ps128(sum);
    __m128 hi = _mm256_extractf128_ps(sum, 1);
    __m128 sum128 = _mm_add_ps(lo, hi);
    
    alignas(16) float result[4];
    _mm_store_ps(result, sum128);
    float final = result[0] + result[1] + result[2] + result[3];
    
    for (; i < n; ++i) {
        final += a[i] * b[i];
    }
    
    return final;
}
```

## Masked Operations

```cpp
// AVX-512 mask
__m512 a = _mm512_loadu_ps(a_data);
__m512 b = _mm512_loadu_ps(b_data);
__mmask16 mask = 0xFFFC;  // Use first 14 elements

__m512 result = _mm512_mask_mul_ps(_mm512_setzero_ps(), mask, a, b);
```

## Best Practices

1. **Profile first** - Don't optimize blindly
2. **Use compiler auto-vectorization** - Often sufficient
3. **Data alignment** - 16/32/64 byte aligned
4. **Restrict pointers** - Help compiler understand no-alias
5. **Use portable libraries** - std::simd when available

## Resources

- [Intel Intrinsics Guide](https://software.intel.com/sites/landingpage/IntrinsicsGuide/)
- [SIMD in GCC/Clang](https://gcc.gnu.org/projects/tree-ssa/vectorization.html)
