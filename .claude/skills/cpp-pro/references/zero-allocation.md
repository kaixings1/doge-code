# Zero-Allocation Patterns

Guide to writing C++ code that minimizes or eliminates heap allocations.

## Philosophy

Zero-allocation code:
- Predictable latency (no GC pauses)
- Better cache utilization
- No heap fragmentation
- Hard-real-time guarantees

## In-Place Operations

### In-Place Algorithms

```cpp
#include <algorithm>
#include <vector>

// Bad: Creates temporary
std::vector<int> transform_bad(const std::vector<int>& input) {
    std::vector<int> output;
    for (int x : input) {
        output.push_back(x * 2);
    }
    return output;
}

// Good: In-place modification
void transform_inplace(std::vector<int>& v) {
    for (int& x : v) {
        x *= 2;
    }
}

// Good: Pre-allocated output
void transform_preallocated(const std::vector<int>& input, 
                          std::vector<int>& output) {
    output.resize(input.size());
    std::transform(input.begin(), input.end(), output.begin(),
                   [](int x) { return x * 2; });
}
```

### In-Place Sorting

```cpp
// Using sort on existing container
std::vector<int> data;
data.reserve(1000);
// ... fill data ...
std::sort(data.begin(), data.end());  // In-place

// Partial sort when you only need top-K
std::partial_sort(v.begin(), v.begin() + k, v.end());

// nth_element for median/percentile
std::nth_element(v.begin(), v.begin() + v.size()/2, v.end());
```

## Avoiding Temporaries

### Move Semantics

```cpp
// Bad: Copies
std::string process_bad(std::string s) {
    return s + " processed";
}

// Good: Moves
std::string process_good(std::string s) {
    s += " processed";
    return s;  // NRVO or move
}

// Best: In-place
void process_inplace(std::string& s) {
    s += " processed";
}
```

### emplace vs insert

```cpp
std::vector<std::pair<int, std::string>> v;

// Bad: Creates temporary pair
v.insert(v.end(), std::pair<int, std::string>(1, "one"));

// Good: Uses emplace
v.emplace(v.end(), 1, "one");

// Best: back_emplace with reserve
v.reserve(100);
v.emplace_back(1, "one");
```

## Stack-Based Containers

### Static Vector

```cpp
#include <array>

// Fixed capacity at compile time
template<typename T, size_t N>
class StaticVector {
    std::array<T, N> data_;
    size_t size_ = 0;
    
public:
    void push_back(const T& value) {
        if (size_ < N) {
            data_[size_++] = value;
        }
    }
    
    template<typename... Args>
    void emplace_back(Args&&... args) {
        if (size_ < N) {
            data_[size_++] = T(std::forward<Args>(args)...);
        }
    }
    
    T& operator[](size_t i) { return data_[i]; }
    size_t size() const { return size_; }
};

// Usage - no heap allocation
StaticVector<int, 1000> vec;
for (int i = 0; i < 1000; ++i) {
    vec.push_back(i * 2);
}
```

### Small String Optimization

```cpp
// std::string often stores short strings on stack
std::string s = "short";  // No heap allocation

// Avoid patterns that force heap allocation
std::string result;
for (int i = 0; i < 100; ++i) {
    result += std::to_string(i);  // Could reallocate
}

// Better: reserve
std::string result;
result.reserve(300);  // Pre-allocate
for (int i = 0; i < 100; ++i) {
    result += std::to_string(i);
}
```

## String View

### Avoiding String Copies

```cpp
#include <string_view>

// Bad: Copies substring
std::string get_name() {
    return full_name.substr(0, 5);  // Allocates
}

// Good: Returns view
std::string_view get_name_view() {
    return std::string_view(full_name).substr(0, 5);  // No allocation
}

// Processing without allocation
void process_path(std::string_view path) {
    // Parse without allocation
    while (!path.empty()) {
        auto sep = path.find('/');
        auto component = path.substr(0, sep);
        // Process component
        if (sep == std::string_view::npos) break;
        path = path.substr(sep + 1);
    }
}
```

## span for Buffer Access

```cpp
#include <span>

// Bad: Takes ownership
void process_vector(std::vector<int> data);  // Copies!

// Good: Views buffer
void process_span(std::span<int> data);  // No copy

// Usage
std::vector<int> v = {1, 2, 3, 4, 5};
process_span(v);  // No copy

int arr[] = {1, 2, 3};
process_span(arr);  // Works with arrays too
```

## Zero-Allocation Data Structures

### Ring Buffer

```cpp
template<typename T, size_t N>
class RingBuffer {
    std::array<T, N> data_;
    size_t head_ = 0;
    size_t tail_ = 0;
    size_t size_ = 0;
    
public:
    bool push(const T& value) {
        if (size_ >= N) return false;
        data_[tail_] = value;
        tail_ = (tail_ + 1) % N;
        ++size_;
        return true;
    }
    
    bool pop(T& value) {
        if (size_ == 0) return false;
        value = data_[head_];
        head_ = (head_ + 1) % N;
        --size_;
        return true;
    }
    
    bool empty() const { return size_ == 0; }
    bool full() const { return size_ >= N; }
};
```

### intrusive List

```cpp
#include <boost/intrusive/list.hpp>

struct Node : boost::intrusive::list_base_hook<> {
    int data;
};

// No allocation when adding to list
Node n1, n2, n3;
boost::intrusive::list<Node> list;
list.push_back(n1);
list.push_back(n2);
list.push_back(n3);
```

## Avoiding Copies in APIs

### Output Parameters

```cpp
// Bad: Returns vector (potential allocation)
std::vector<int> compute_values();

// Good: Takes output parameter
void compute_values(std::vector<int>& output);
void compute_values(std::span<int> output);

// Even better: Callback/Visitor
void compute_values(auto&& callback) {
    for (int i = 0; i < 100; ++i) {
        callback(i * 2);  // No allocation
    }
}
```

### In-Place Algorithms

```cpp
// std:: algorithms that modify in place
std::sort(v.begin(), v.end());
std::reverse(v.begin(), v.end());
std::fill(v.begin(), v.end(), 0);
std::replace(v.begin(), v.end(), old_val, new_val);
std::remove_if(v.begin(), v.end(), pred);  // Note: returns new end
v.erase(std::remove_if(v.begin(), v.end(), pred), v.end());

// Partial modifications
std::transform(v.begin(), v.end(), v.begin(), 
               [](int x) { return x * 2; });  // In-place
```

## Custom Allocators

### Stack Arena

```cpp
// Use with STL containers
#include <memory_resource>

class StackResource : public std::pmr::memory_resource {
    char* buffer_;
    size_t size_;
    size_t offset_ = 0;
    
public:
    StackResource(size_t size) : size_(size) {
        buffer_ = new char[size];
    }
    
    ~StackResource() { delete[] buffer_; }
    
protected:
    void* do_allocate(size_t bytes, size_t align) override {
        // Align offset
        size_t aligned = (offset_ + align - 1) & ~(align - 1);
        if (aligned + bytes > size_) {
            throw std::bad_alloc();
        }
        void* ptr = buffer_ + aligned;
        offset_ = aligned + bytes;
        return ptr;
    }
    
    void do_deallocate(void* p, size_t bytes, size_t align) override {
        // No-op for stack allocator
    }
    
    bool do_is_equal(const std::pmr::memory_resource& other) const noexcept override {
        return this == &other;
    }
};

// Usage
StackResource stack(1024 * 1024);
std::pmr::vector<int> vec{&stack};
for (int i = 0; i < 1000; ++i) {
    vec.push_back(i);  // From stack pool, no heap
}
```

## Generator Patterns

### Lazy Evaluation

```cpp
#include <generator>

// C++23 generator - no allocation per element
std::generator<int> fibonacci() {
    int a = 0, b = 1;
    while (true) {
        co_yield a;
        int c = a + b;
        a = b;
        b = c;
    }
}

// Usage - iterates without allocation
for (int x : fibonacci()) {
    if (x > 1000) break;
    process(x);
}

// Pre-C++23: Callback pattern
void process_values(auto callback) {
    int a = 0, b = 1;
    for (int i = 0; i < 100; ++i) {
        callback(a);
        int c = a + b;
        a = b;
        b = c;
    }
}
```

## Optimization Checklist

1. **Reserve capacity** - `vec.reserve(n)` before loops
2. **Use emplace** - `vec.emplace_back()` not `push_back`
3. **Pre-allocate** - For known sizes
4. **Pass by reference** - Avoid copies
5. **Use string_view** - For string parameters
6. **Use span** - For buffer parameters
7. **In-place operations** - Prefer over returning copies
8. **Avoid unnecessary temporaries** - Watch for implicit copies

## Performance Impact

```cpp
// Benchmark: push_back vs emplace_back
for (int i = 0; i < 1000000; ++i) {
    v.push_back(i);           // Creates temporary
}

for (int i = 0; i < 1000000; ++i) {
    v.emplace_back(i);        // Constructs in-place
}

// Benchmark: copy vs move
std::vector<int> source(1000);
std::vector<int> v1 = source;      // Copy - allocates
std::vector<int> v2 = std::move(source);  // Move - no allocation
```

## Best Practices

1. **Profile first** - Allocation cost isn't always the bottleneck
2. **Reserve when possible** - Known sizes
3. **Use stack allocation** - For bounded data
4. **Pass views** - Don't take ownership
5. **Pre-allocate** - For loops that grow containers

## Resources

- [C++ Core Guidelines: P](https://isocpp.github.io/CppCoreGuidelines/CppCoreGuidelines#S-parem)
- [Folly's fbvector](https://github.com/facebook/folly/blob/main/folly/docs/FBVector.md)
