# Compile-Time Programming

Comprehensive guide to compile-time computation in C++, covering constexpr, consteval, template metaprogramming, and static reflection.

## Constexpr Functions

### Basics

```cpp
// C++11 constexpr - limited to single return
constexpr int square(int x) {
    return x * x;
}

// C++14 constexpr - can have multiple statements
constexpr int factorial(int n) {
    int result = 1;
    for (int i = 2; i <= n; ++i) {
        result *= i;
    }
    return result;
}

// C++20 constexpr - dynamic memory, try-catch, virtual
constexpr std::vector<int> fibs(int n) {
    std::vector<int> result;
    result.reserve(n);
    int a = 0, b = 1;
    for (int i = 0; i < n; ++i) {
        result.push_back(a);
        int c = a + b;
        a = b;
        b = c;
    }
    return result;
}

constexpr auto fib = fibs(10);  // Computed at compile time!
```

### Constexpr with Branching

```cpp
// if constexpr (C++17) - compile-time branch elimination
template<typename T>
auto process(T value) {
    if constexpr (std::is_integral_v<T>) {
        return value * 2;
    } else if constexpr (std::is_floating_point_v<T>) {
        return value * 2.0;
    } else {
        // This branch is discarded for integral/floating types
        return value;
    }
}

// Requires clause
template<typename T>
requires std::integral<T>
T add(T a, T b) {
    return a + b;
}
```

## Consteval (C++20)

### Immediate Functions

```cpp
// consteval - must be evaluated at compile time
consteval int square(int x) {
    return x * x;
}

constexpr int a = square(5);  // OK: compile time
int b = square(5);  // ERROR: can't evaluate at runtime!

// consteval with std::is_constant_evaluated (C++20)
constexpr int compute(int n) {
    if (std::is_constant_evaluated()) {
        // Compile-time path
        return n * n;
    } else {
        // Runtime path
        return runtime_compute(n);
    }
}
```

## Constexpr Algorithms

### Standard Library Constexpr (C++20)

```cpp
#include <array>
#include <algorithm>

constexpr auto sorted = []() {
    std::array<int, 5> arr = {5, 2, 8, 1, 9};
    std::sort(arr.begin(), arr.end());
    return arr;
}();  // Computed at compile time!

// constexpr find
constexpr int find_value(const auto& arr, int target) {
    for (size_t i = 0; i < arr.size(); ++i) {
        if (arr[i] == target) return static_cast<int>(i);
    }
    return -1;
}

constexpr std::array data = {1, 2, 3, 4, 5};
constexpr int idx = find_value(data, 3);  // 2
```

### Constexpr String (C++20)

```cpp
constexpr std::string_view trim_sv(std::string_view sv) {
    while (!sv.empty() && std::isspace(sv.front())) {
        sv.remove_prefix(1);
    }
    while (!sv.empty() && std::isspace(sv.back())) {
        sv.remove_suffix(1);
    }
    return sv;
}

constexpr auto trimmed = trim_sv("  hello  ");  // "hello" at compile time
```

## Template Metaprogramming

### Type Traits

```cpp
#include <type_traits>

// Type checking
static_assert(std::is_integral_v<int>);
static_assert(std::is_floating_point_v<double>);
static_assert(std::is_pointer_v<int*>);
static_assert(std::is_array_v<int[5]>);
static_assert(std::is_class_v<std::string>);

// Type modifications
using T = const int;
static_assert(std::is_const_v<std::remove_const_t<T>>);  // true

using Ptr = int*;
static_assert(std::is_pointer_v<std::remove_pointer_t<Ptr>>);  // true

// Function traits
static_assert(std::is_function_v<void(int)>);
static_assert(std::is_member_function_pointer_v<void (Foo::*)()>);
```

### Conditional Types

```cpp
#include <type_traits>

// Conditional type
template<typename T>
using MakeUnsigned = std::conditional_t<
    std::is_signed_v<T>,
    std::make_unsigned_t<T>,
    T
>;

// Enable if
template<typename T>
std::enable_if_t<std::is_integral_v<T>, T> 
double_value(T t) {
    return static_cast<double>(t) * 2.0;
}

// Void_t trick - detect if expression is valid
template<typename T, typename = void>
struct has_size : std::false_type {};

template<typename T>
struct has_size<T, std::void_t<decltype(std::declval<T>().size())>> 
    : std::true_type {};

static_assert(has_size<std::vector<int>>::value);  // true
static_assert(has_size<int>::value);  // false
```

### Detection Idiom

```cpp
// C++17 detection idiom
template<typename T, typename = void>
struct is_iterable : std::false_type {};

template<typename T>
struct is_iterable<T, std::void_t<
    decltype(std::declval<T>().begin()),
    decltype(std::declval<T>().end())
>> : std::true_type {};

// C++20 concepts (cleaner!)
template<typename T>
concept Iterable = requires(T t) {
    { t.begin() };
    { t.end() };
};

template<Iterable T>
void process(T& t) {
    for (auto& item : t) {
        // ...
    }
}
```

## Compile-Time Iteration

### Recursive Templates

```cpp
template<int N>
constexpr int fibonacci = fibonacci<N - 1> + fibonacci<N - 2>;

template<>
constexpr int fibonacci<0> = 0;

template<>
constexpr int fibonacci<1> = 1;

static_assert(fibonacci<10> == 55);  // Verified at compile time

// Parameter pack expansion
template<typename... Ts>
constexpr std::size_t sum_sizes = (sizeof(Ts) + ...);

static_assert(sum_sizes<int, double, char> == 9);  // 4 + 8 + 1
```

### Fold Expressions

```cpp
// Unary left fold
template<typename... Args>
auto sum(Args... args) {
    return (... + args);  // ((1 + 2) + 3)
}

// Unary right fold
template<typename... Args>
auto sum_r(Args... args) {
    return (args + ...);  // (1 + (2 + 3))
}

// Binary fold
template<typename... Args>
bool all_true(Args... args) {
    return (... && args);  // All must be true
}

// With initial value
template<typename... Args>
auto sum_init(int init, Args... args) {
    return (init + ... + args);
}

// Print all
template<typename... Args>
void print_all(Args&&... args) {
    ((std::cout << args << '\n'), ...);
}
```

## Static Reflection (C++26)

### Reflection TS Overview

```cpp
// C++26 reflection (expected)
#include <reflection>

struct Point {
    int x;
    int y;
};

// Reflect on members
constexpr auto members = [:reflect(Point):];

// Iterate at compile time
constexpr int sum_point(const Point& p) {
    int sum = 0;
    for (constexpr auto m : members) {
        sum += p.[:m:];  // Access member by reflection
    }
    return sum;
}

// Generate serialization
template<typename T>
constexpr auto field_names = [] {
    std::array<std::string_view, [:reflect(T):].size()> names;
    size_t i = 0;
    for (constexpr auto m : [:reflect(T):]) {
        names[i++] = [:m.name:];
    }
    return names;
};
```

## Magic Statics

### Compile-Time Computation Library

```cpp
#include <array>

// CTRE - Compile-Time Regular Expressions
// #include <ctre.hpp>

// constexpr std::array from compile-time string
template<std::size_t N>
constexpr std::array<char, N> to_array(const char* s) {
    std::array<char, N> arr = {};
    for (std::size_t i = 0; i < N; ++i) {
        arr[i] = s[i];
    }
    return arr;
}

constexpr auto hex_digits = to_array("0123456789ABCDEF");

// Compile-time hash
constexpr std::uint32_t hash_ct(const char* s) {
    std::uint32_t h = 2166136261U;
    while (*s) {
        h ^= static_cast<std::uint32_t>(*s);
        h *= 16777619U;
        ++s;
    }
    return h;
}

constexpr auto h = hash_ct("hello");
```

## Static Assert and Concepts

### Compile-Time Verification

```cpp
// Static assert
static_assert(sizeof(int) >= 4, "int must be at least 32 bits");
static_assert(std::is_trivially_destructible_v<Widget>);

// Concept definitions
template<typename T>
concept Numeric = std::integral<T> || std::floating_point<T>;

template<typename T>
concept Addable = requires(T a, T b) {
    { a + b } -> std::convertible_to<T>;
};

template<typename T>
concept Hashable = requires(T a) {
    { std::hash<T>{}(a) } -> std::convertible_to<std::size_t>;
};

// Use concepts
template<Numeric T>
T add(T a, T b) { return a + b; }

template<Hashable T>
std::size_t hash(const T& t) { return std::hash<T>{}(t); }
```

## Best Practices

1. **Use constexpr** - For compile-time computation
2. **Use consteval** - When runtime evaluation is forbidden
3. **Prefer constexpr functions** - Over template metaprogramming
4. **Use if constexpr** - For compile-time branching
5. **Use concepts** - For clearer constraints
6. **Profile** - Ensure compile-time doesn't explode build times

## Resources

- [C++ constexpr Proposals](https://wg21.link/p0784)
- [C++20 Concepts](https://en.cppreference.com/w/cpp/language/constraints)
- [Compile-Time String Hashing](https://stackoverflow.com/questions/21116697/compile-time-string-hashing)
