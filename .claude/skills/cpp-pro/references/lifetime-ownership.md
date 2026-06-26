# Lifetime and Ownership

Comprehensive guide to object lifetime, ownership semantics, and preventing dangling references in modern C++.

## Object Lifetime

### Lifetime Basics

```cpp
class Widget {
public:
    Widget() { std::cout << "Construct\n"; }
    ~Widget() { std::cout << "Destruct\n"; }
    void use() { std::cout << "Use\n"; }
};

void example() {
    Widget w;           // Lifetime begins
    w.use();            // Valid
}                       // Lifetime ends - destructor called

void example2() {
    Widget* w = new Widget;
    w->use();
    delete w;           // Destructor called, memory freed
    // w is now dangling!
}
```

### Lifetime Extension

```cpp
// Temporary lifetime extension
const std::string& get_ref() {
    return std::string("temporary");  // BUG: dangling reference!
}

// Correct - return by value
std::string get_val() {
    return std::string("temporary");  // NRVO/move
}

// Temporary binds to const ref - extends lifetime
void foo(const std::string& s);

std::string s = "hello";
foo(s);  // s lifetime - fine
foo(std::string("temporary"));  // temporary extends to end of full expression

// BUT NOT:
const std::string& bar() {
    return std::string("temp");  // DANGER: reference to temporary
}
```

## Reference Lifetime

### Dangling References

```cpp
// Dangling reference - local variable
int& get_ref_to_local() {
    int x = 42;
    return x;  // DANGER: x dies here
}

// Dangling reference - container element
std::vector<std::reference_wrapper<int>> create_refs() {
    int x = 5;
    // Bad: x dies, refs become dangling
    return {std::ref(x)};  // DON'T DO THIS
}

// Correct: return by value or ensure lifetime
std::vector<int> get_values() {
    int x = 5;
    return {x};  // Copy/move
}

// If you must use ref_wrapper
class Holder {
    int value_;
    std::vector<std::reference_wrapper<int>> refs_;
public:
    Holder() : value_(42) {
        refs_.push_back(std::ref(value_));  // OK: value_ outlives refs_
    }
};
```

### Safe Reference Passing

```cpp
#include <string_view>

// Prefer string_view for read-only string access
void process(std::string_view sv);  // No lifetime issues

// For owning data, use spans
#include <span>

void process_array(std::span<int> data);  // Bounds-aware, no ownership

// Parameter lifetime - caller guarantees
void danger(const std::string& s);  // Caller must ensure s outlives function

// Better: explicit lifetime
void safe(std::string_view s);  // s is just a view
```

## Ownership Patterns

### Unique Ownership

```cpp
#include <memory>

// unique_ptr - exclusive ownership
std::unique_ptr<Widget> create_widget() {
    return std::make_unique<Widget>();
}

void use_widget(std::unique_ptr<Widget> w);  // Takes ownership
void observe_widget(const Widget& w);  // Borrows, no ownership

// Transfer ownership
auto w = create_widget();
use_widget(std::move(w));  // w is now empty

// Release ownership
auto raw = w.release();  // w gives up ownership
delete raw;  // Manual cleanup

// Custom deleter
auto file = std::unique_ptr<FILE, decltype(&fclose)>(
    fopen("data.txt", "r"), &fclose
);
```

### Shared Ownership

```cpp
#include <memory>

// shared_ptr - shared ownership with reference counting
auto s1 = std::make_shared<Widget>();
auto s2 = s1;  // Reference count = 2

// Weak pointer - non-owning reference
std::weak_ptr<Widget> w = s1;
if (auto locked = w.lock()) {
    // Use locked
}
if (w.expired()) {
    // Object destroyed
}

// Factory with caching
class WidgetFactory {
    std::map<int, std::shared_ptr<Widget>> cache_;
    std::mutex mtx_;
    
public:
    std::shared_ptr<Widget> get(int id) {
        std::lock_guard lock(mtx_);
        if (auto it = cache_.find(id); it != cache_.end()) {
            return it->second;
        }
        auto widget = std::make_shared<Widget>(id);
        cache_[id] = widget;
        return widget;
    }
};
```

### Observer Pattern with Weak Pointer

```cpp
#include <memory>
#include <vector>

class Observable;

class Observer : public std::enable_shared_from_this<Observer> {
public:
    virtual void on_notify(const std::string& msg) = 0;
    void observe(std::shared_ptr<Observable> obs) {
        obs->subscribe(shared_from_this());
    }
};

class Observable {
    std::vector<std::weak_ptr<Observer>> observers_;
    
public:
    void subscribe(std::shared_ptr<Observer> obs) {
        observers_.push_back(obs);
    }
    
    void notify(const std::string& msg) {
        // Clean up expired observers
        observers_.erase(
            std::remove_if(observers_.begin(), observers_.end(),
                [](const auto& w) { return w.expired(); }),
            observers_.end()
        );
        
        // Notify
        for (auto& w : observers_) {
            if (auto obs = w.lock()) {
                obs->on_notify(msg);
            }
        }
    }
};
```

## Lifetime in Containers

### Reference Wrappers in Containers

```cpp
#include <functional>
#include <vector>
#include <map>

// DON'T store references in containers
// std::vector<int&> vec;  // ERROR: references can't be stored

// Use reference_wrapper
std::vector<std::reference_wrapper<int>> refs;
int x = 1, y = 2;
refs.push_back(std::ref(x));
refs.push_back(std::ref(y));

refs[0].get() = 10;  // Modifies x

// For maps with reference-like semantics
std::map<std::string, std::reference_wrapper<const std::string>> lookup;

// Function objects that hold references
auto ref_collector = [&x, &y](int val) {
    // Captures references to x and y
};
```

### Lifetime of Container Elements

```cpp
#include <vector>
#include <string>

// Vector copies/moves elements
std::string s = "hello";
std::vector<std::string> v;
v.push_back(s);  // Copy
v.push_back(std::move(s));  // Move, s now empty

// Iterators can dangle
auto it = v.begin();
v.clear();  // it now dangles!

// Emplace constructs in place
std::vector<std::unique_ptr<Widget>> widgets;
widgets.emplace_back(new Widget());  // No copy/move
widgets.emplace_back(std::make_unique<Widget>());

// unique_ptr in containers - automatic cleanup
widgets.clear();  // All widgets destroyed
```

## Safe Return Patterns

### Return by Value

```cpp
// Always safe - creates copy or uses RVO
Widget create_widget() {
    return Widget();
}

// Even better - NRVO
Widget create_widget2() {
    Widget w;
    return w;  // NRVO - no copy
}

// For expensive-to-copy types, ensure move
class Buffer {
    char* data_;
    size_t size_;
public:
    Buffer(size_t s) : data_(new char[s]), size_(s) {}
    ~Buffer() { delete[] data_; }
    
    // Enable move
    Buffer(Buffer&& other) noexcept 
        : data_(other.data_), size_(other.size_) {
        other.data_ = nullptr;
        other.size_ = 0;
    }
    
    Buffer& operator=(Buffer&& other) noexcept {
        delete[] data_;
        data_ = other.data_;
        size_ = other.size_;
        other.data_ = nullptr;
        other.size_ = 0;
        return *this;
    }
};
```

### Return by Reference

```cpp
// Safe - returning reference to member
class Widget {
    std::string name_;
public:
    const std::string& name() const { return name_; }  // OK
    std::string& name() { return name_; }  // OK if object lifetime managed
};

// Safe - static or global
Widget& get_global() {
    static Widget w;
    return w;  // OK: static has program lifetime
}

// DANGER - returning reference to parameter
Widget& danger(Widget& w) {
    return w;  // OK if caller manages lifetime
}

Widget& danger2() {
    Widget w;
    return w;  // DANGER: dangling reference!
}
```

## Lifetime Safety Tools

### std::launder (C++17)

```cpp
#include <new>
#include <string>

const int& get_ref() {
    static int value = 42;
    return value;
}

// For placement new and const
const int* p = new const int(42);
int* q = const_cast<int*>(p);
int* r = std::launder(q);  // Required to access through new pointer
```

### GSL span and owner

```cpp
#include <gsl/span>
#include <gsl/owner>

// span - non-owning view into array
void process(span<int> data);  // Clear that we don't own

// owner - explicit ownership marker
owner<int*> p = new int(42);  // Documents ownership

// not_null - guaranteed non-null
not_null<int*> ptr = get_valid_pointer();
```

## Common Dangling Pitfalls

```cpp
// Pitfall 1: String literal to string_view
std::string_view sv = "temporary";  // OK: string literals have static lifetime

// Pitfall 2: Function returning local by reference
int* bad() {
    int x;
    return &x;  // DANGER
}

// Pitfall 3: Pointer from new, stored in container
std::vector<int*> ints;
ints.push_back(new int(42));  // Memory leak!

// Pitfall 4: Iterator to temporary
auto it = std::find_if(v.begin(), v.end(), pred);
v = {};  // it dangles!

// Pitfall 5: Range-based for with temporary
for (auto& x : get_vector()) {  // get_vector() returns temporary
    // x is reference to temporary!
}
// Correct:
auto v = get_vector();
for (auto& x : v) {  // OK
}
```

## Best Practices

1. **Prefer value semantics** - Return by value when possible
2. **Use smart pointers** - unique_ptr for ownership, shared_ptr for shared
3. **Use string_view/span** - For read-only views
4. **Avoid raw new/delete** - Use make_unique/make_shared
5. **Document ownership** - In function signatures and comments
6. **Use GSL** - span, owner, not_null for clarity
7. **Return references only for members** - Never for locals

## Resources

- [C++ Core Guidelines: F](https://isocpp.github.io/CppCoreGuidelines/CppCoreGuidelines#f23-use-a-not_nullptr-to-indicate-that-null-is-not-a-valid-value)
- [Lifetime Safety - Google C++ Guide](https://google.github.io/styleguide/cppguide.html#Lifetime)
