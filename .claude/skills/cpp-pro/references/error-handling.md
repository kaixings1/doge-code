# Error Handling

Comprehensive guide to error handling in modern C++, covering exceptions, error codes, result types, and safety guarantees.

## Exception Safety Guarantees

### Three Guarantees

```cpp
class Widget {
    std::vector<int> data_;
    std::string name_;
    
public:
    // No guarantee - may leak resources, leave object in invalid state
    void unsafe_operation() {
        data_.push_back(42);  // May throw
        name_ = "test";        // May throw
    }
    
    // Basic guarantee - object remains valid, no leaks
    void basic_operation() noexcept {
        data_.push_back(42);  // Strong exception safety
    }
    
    // Strong guarantee - operation either succeeds or throws, state unchanged
    void strong_operation() {
        auto temp = data_;  // Copy
        temp.push_back(42);
        temp.swap(data_);  // Commit atomically
    }
    
    // Nothrow guarantee - never throws
    void nothrow_operation() noexcept {
        // All operations guaranteed not to throw
    }
};
```

### noexcept Specifiers

```cpp
// Function that may throw
void may_throw() {}

// Function guaranteed not to throw
void no_throw() noexcept {}

// Conditional noexcept
template<typename T>
void process(T& obj) noexcept(std::is_nothrow_move_constructible_v<T>) {
    T temp = std::move(obj);  // Only compiles if noexcept move
}

// noexcept operator - compile-time check
static_assert(noexcept(std::vector<int>().push_back(1)));  // true
```

## std::error_code and std::error_condition

```cpp
#include <system_error>

// Custom error category
class my_error_category : public std::error_category {
public:
    const char* name() const noexcept override {
        return "my_error";
    }
    
    std::string message(int ev) const override {
        switch (ev) {
            case 1: return "Invalid input";
            case 2: return "Timeout";
            default: return "Unknown error";
        }
    }
    
    bool equivalent(const std::error_code& code, int condition) const override {
        return *this == code.category() && code.value() == condition;
    }
};

const my_error_category& my_category() {
    static my_error_category instance;
    return instance;
}

// Error codes
std::error_code make_error_code(my_error e) {
    return {static_cast<int>(e), my_category()};
}

enum class my_error { invalid_input = 1, timeout = 2 };

// Usage
std::error_code ec = make_error_code(my_error::invalid_input);
if (ec) {
    std::cerr << ec.message() << '\n';
}
```

## std::expected (C++23) / std::optional Pattern

```cpp
#include <expected>
#include <optional>
#include <string>

// Using std::expected for fallible functions
std::expected<int, std::string> divide(int a, int b) {
    if (b == 0) {
        return std::unexpected("Division by zero");
    }
    return a / b;
}

// Chaining expected
std::expected<int, std::string> process_data(int input) {
    auto validated = validate(input);
    if (!validated) {
        return std::unexpected(validated.error());
    }
    
    auto computed = compute(*validated);
    if (!computed) {
        return std::unexpected(computed.error());
    }
    
    return *computed;
}

// Transform
auto doubled = divide(10, 2).transform([](int x) { return x * 2; });

// Or_else for error handling
divide(10, 0).or_else([](const std::string& err) {
    std::cerr << "Error: " << err << '\n';
    return 0;
});

// Using std::optional for possibly-absent values
std::optional<int> find_value(const std::map<int, std::string>& m, int key) {
    auto it = m.find(key);
    if (it != m.end()) {
        return it->second;  // Implicit conversion
    }
    return std::nullopt;
}

// Chaining optionals
std::optional<int> result = find_value(m, 1)
    .and_then([](const std::string& s) {
        return parse_int(s);
    })
    .transform([](int n) {
        return n * 2;
    });
```

## Result Type Pattern (pre-C++23)

```cpp
#include <variant>
#include <string>

template<typename T, typename E>
class Result {
    std::variant<T, E> data_;
    
public:
    bool ok() const { return std::holds_alternative<T>(data_); }
    
    T& value() { return std::get<T>(data_); }
    const T& value() const { return std::get<T>(data_); }
    
    E& error() { return std::get<E>(data_); }
    const E& error() const { return std::get<E>(data_); }
    
    template<typename F>
    auto map(F&& f) -> Result<decltype(f(std::declval<T>())), E> {
        if (ok()) {
            return Result<decltype(f(value())), E>(f(value()));
        }
        return Result<decltype(f(value())), E>(error());
    }
    
    template<typename F>
    auto flat_map(F&& f) -> decltype(f(value())) {
        if (ok()) {
            return f(value());
        }
        return decltype(f(value()))(error());
    }
    
    // Factory methods
    static Result success(T&& v) { 
        Result r; 
        r.data_ = std::move(v); 
        return r; 
    }
    
    static Result failure(E&& e) { 
        Result r; 
        r.data_ = std::move(e); 
        return r; 
    }
    
private:
    Result() = default;
    friend struct std::formatter<Result<T, E>>;
};

// Usage
Result<int, std::string> divide(int a, int b) {
    if (b == 0) {
        return Result<int, std::string>::failure("Division by zero");
    }
    return Result<int, std::string>::success(a / b);
}

auto result = divide(10, 2);
if (result.ok()) {
    std::cout << result.value() << '\n';
} else {
    std::cerr << result.error() << '\n';
}
```

## Exception Handling Patterns

```cpp
#include <exception>
#include <stdexcept>

// Catch by reference
try {
    risky_operation();
} catch (const std::runtime_error& e) {
    std::cerr << "Runtime error: " << e.what() << '\n';
} catch (const std::exception& e) {
    std::cerr << "Error: " << e.what() << '\n';
} catch (...) {
    std::cerr << "Unknown error\n";
    throw;  // Re-throw
}

// Stack unwinding - RAII ensures cleanup
class Resource {
public:
    ~Resource() { std::cout << "Cleanup\n"; }
};

void risky() {
    Resource r;
    throw std::runtime_error("error");
}

try {
    risky();
} catch (...) {
    // r destructor called before catch
}

// Nested exceptions
try {
    try {
        throw std::runtime_error("inner");
    } catch (...) {
        std::throw_with_nested(std::runtime_error("outer"));
    }
} catch (const std::nested_exception& e) {
    std::cerr << e.what() << '\n';
    try {
        e.rethrow_nested();
    } catch (const std::runtime_error& inner) {
        std::cerr << "  caused by: " << inner.what() << '\n';
    }
}
```

## Error Handling in Constructors

```cpp
class Widget {
    std::vector<int> data_;
    std::string name_;
    
public:
    Widget(std::istream& in) try : data_(), name_() {
        // Constructor body
        if (!in) throw std::runtime_error("Invalid stream");
    } catch (...) {
        // Handle exceptions from member initialization
        throw;
    }
    
    // Factory function for complex construction
    static std::expected<Widget, std::string> create(
        const std::string& name, int size) 
    {
        if (name.empty()) {
            return std::unexpected("Empty name");
        }
        if (size < 0) {
            return std::unexpected("Negative size");
        }
        
        Widget w;
        w.name_ = name;
        w.data_.reserve(size);
        return w;
    }
};
```

## Error Handling in Destructors

```cpp
class Resource {
public:
    ~Resource() noexcept {
        try {
            close();  // May throw
        } catch (...) {
            std::terminate();  // Or log and suppress
        }
    }
    
    void close() noexcept(false) {
        // Can throw if needed
    }
};

// Better: use RAII with release
class BetterResource {
    int fd_ = -1;
    
public:
    ~BetterResource() {
        if (fd_ >= 0) {
            close(fd_);  // Ignore errors in destructor
        }
    }
    
    void close() {
        if (fd_ >= 0) {
            ::close(fd_);
            fd_ = -1;
        }
    }
    
    int release() {
        int fd = fd_;
        fd_ = -1;
        return fd;
    }
};
```

## best_practices Error Codes

```cpp
// POSIX error codes
#include <cerrno>

// Check system calls
FILE* f = fopen("file.txt", "r");
if (!f) {
    std::error_code ec(errno, std::system_category());
    std::cerr << "Failed to open: " << ec.message() << '\n';
}

// Using errno directly
if (errno == ENOENT) {
    // File not found
}
```

## Error Handling Strategies

| Scenario | Approach |
|----------|----------|
| Constructor failure | Use exceptions or factory functions returning expected |
| Fallible operations | Return expected/optional |
| Memory allocation | Let it throw or use nothrow_new |
| I/O errors | Use error_code for recoverable, exceptions for fatal |
| Contracts | Use assert or custom contract violation handler |
| Library APIs | Prefer error_code over exceptions |

## Logging Errors

```cpp
#include <source_location>

void log_exception(const std::exception& e,
                   const std::source_location& loc = std::source_location::current()) {
    std::cerr << "Exception at " << loc.file_name() << ":" 
              << loc.line() << " in " << loc.function_name() << "\n"
              << "  what: " << e.what() << "\n";
}

// Usage
try {
    risky_operation();
} catch (const std::exception& e) {
    log_exception(e);
}
```

## Best Practices

1. **Use exceptions for exceptional cases** - Not for flow control
2. **Prefer noexcept for destructors** - Never let exceptions escape
3. **Use RAII** - Automatic cleanup on scope exit
4. **Provide strong guarantee** - Either succeed or leave state unchanged
5. **Catch by const reference** - Slices off derived types otherwise
6. **Don't catch(...)** - Unless re-throwing or for cleanup
7. **Use expected/optional** - For recoverable errors in APIs
8. **Document exception safety** - In headers and docs

## Resources

- [C++ Exception Handling](https://en.cppreference.com/w/cpp/language/exceptions)
- [Howard Hinnant's Exception Safety](https://howardhinnant.github.io/exception_safety.html)
- [C++ Core Guidelines: E](https://isocpp.github.io/CppCoreGuidelines/CppCoreGuidelines#S-errors)
