# Contract Programming

Guide to contract-based programming in C++ using assertions, preconditions, postconditions, and invariants.

## Concepts

Contracts specify:
- **Preconditions**: What must be true before function call
- **Postconditions**: What must be true after function call
- **Invariants**: What must be true throughout object lifetime

## C++ Core Guidelines Contracts

### Preconditions

```cpp
#include <cassert>

// Using assert for precondition
int divide(int a, int b) {
    assert(b != 0 && "Divisor must not be zero");
    return a / b;
}

// Using requires for compile-time checking
template<typename T>
requires std::integral<T>
T half(T value) {
    return value / 2;
}
```

### Postconditions

```cpp
// Using assertion after operation
int find_index(const std::vector<int>& v, int target) {
    auto it = std::find(v.begin(), v.end(), target);
    int index = it - v.begin();
    assert((index == v.size() || v[index] == target) && 
           "Index must be valid or not found");
    return index;
}
```

## GSL Contracts (C++ Core Guidelines)

### Expects

```cpp
#include <gsl/gsl>

void process(int* ptr) {
    // Precondition - pointer must not be null
    Expects(ptr != nullptr);
    
    // Process
}

// Postcondition - value must be in range
int bounded_value(int min, int max, int value) {
    Expects(min <= max);
    int result = std::clamp(value, min, max);
    Ensures(result >= min && result <= max);
    return result;
}
```

## Custom Contract Macros

### Simple Implementation

```cpp
#ifndef CONTRACTS_H
#define CONTRACTS_H

#include <iostream>
#include <source_location>

#ifdef CONTRACTS_ENABLED
    #define PRECONDITION(cond, msg) \
        if (!(cond)) { \
            std::cerr << "PRECONDITION FAILED: " << #cond \
                      << " at " << __FILE__ << ":" << __LINE__ << "\n"; \
            std::terminate(); \
        }
    
    #define POSTCONDITION(cond, msg) \
        if (!(cond)) { \
            std::cerr << "POSTCONDITION FAILED: " << #cond \
                      << " at " << __FILE__ << ":" << __LINE__ << "\n"; \
            std::terminate(); \
        }
    
    #define INVARIANT(invariant_check) invariant_check()
#else
    #define PRECONDITION(cond, msg) ((void)0)
    #define POSTCONDITION(cond, msg) ((void)0)
    #define INVARIANT(invariant_check) ((void)0)
#endif

#endif
```

### Usage

```cpp
#include "contracts.h"

class Widget {
    int value_ = 0;
    
    void check_invariant() const {
        INVARIANT([this]() {
            PRECONDITION(value_ >= 0, "Value must be non-negative");
        });
    }
    
public:
    void set_value(int v) {
        PRECONDITION(v >= 0, "Value must be non-negative");
        value_ = v;
        POSTCONDITION(value_ == v, "Value should be set");
    }
};
```

## Contract Libraries

### Boost.Contract (Legacy)

```cpp
#include <boost/contract.hpp>

class Widget : public boost::contract::constructor_precondition<Widget> {
public:
    void invariant() const {
        BOOST_CONTRACT_INVARIANT(value_ >= 0);
    }
    
    explicit Widget(int v)
        : boost::contract::constructor_precondition<Widget>([&] {
            BOOST_CONTRACT_REQUIRE(v >= 0);
        })
        , value_(v)
    {
        BOOST_CONTRACT_POSTCONDITION([&] {
            BOOST_CONTRACT_ASSERT(value_ >= 0);
        });
    }
};
```

## Static Analysis

### Compile-Time Contracts

```cpp
// Static assertion - compile-time check
static_assert(std::is_integral_v<T>, "T must be integral");

// Concept - compile-time precondition
template<typename T>
concept Numeric = std::integral<T> || std::floating_point<T>;

template<Numeric T>
T add(T a, T b) {
    return a + b;
}
```

## Runtime Contracts

### Using std::source_location

```cpp
#include <source_location>

void check_contract(bool condition, 
                   std::string_view message,
                   std::source_location loc = 
                       std::source_location::current()) {
    if (!condition) {
        std::cerr << "Contract violation at " 
                  << loc.file_name() << ":" << loc.line() << "\n"
                  << "Function: " << loc.function_name() << "\n"
                  << "Message: " << message << "\n";
        std::terminate();
    }
}

#define REQUIRE(cond) check_contract(cond, #cond)
#define ENSURE(cond) check_contract(cond, #cond)
```

## Class Invariants

### RAII Invariants

```cpp
class Widget {
    std::vector<int> data_;
    size_t max_size_;
    
    void check_invariant() const {
        assert(data_.size() <= max_size_ && "Data size exceeds maximum");
    }
    
public:
    Widget(size_t max) : max_size_(max) {
        check_invariant();
    }
    
    void add(int value) {
        assert(data_.size() < max_size_ && "Cannot add: at capacity");
        data_.push_back(value);
        check_invariant();
    }
    
    int get(size_t index) const {
        assert(index < data_.size() && "Index out of bounds");
        check_invariant();
        return data_[index];
    }
};
```

## Best Practices

1. **Use assertions** - For internal checks
2. **Use contracts** - For API pre/post conditions
3. **Don't have side effects** - In contract checks
4. **Disable in release** - For performance
5. **Document contracts** - In comments

## Resources

- [C++ Core Guidelines: Contracts](https://github.com/isocpp/CppCoreGuidelines/blob/master/CppCoreGuidelines.md#i24-use-contracts-to-document-and-validate-the-state-and-arguments)
- [GSL Library](https://github.com/microsoft/GSL)
