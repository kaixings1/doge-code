# API Design

Guide to designing C++ APIs that are robust, maintainable, and user-friendly.

## API Design Principles

### Clarity

```cpp
// Clear naming
class ConnectionPool;  // Good: describes what it is
class CP;              // Bad: unclear abbreviation

// Verb for operations
void connect();
void disconnect();
void send_message();

// Noun for queries
std::string name() const;
size_t size() const;
bool empty() const;
```

### Consistency

```cpp
// Consistent return types
class Container {
public:
    // For mutating operations, return *this
    Container& add(Item item) {
        items_.push_back(std::move(item));
        return *this;
    }
    
    // For queries that might fail, use optional
    std::optional<Item> get(size_t index) const;
    
    // For queries, return value or const ref
    const Item& front() const;
    Item clone_front() const;
};
```

### Error Handling

```cpp
// Clear error handling
class Result {
public:
    bool ok() const;
    Value& value();
    const Error& error();
};

// Use exceptions for exceptional cases
void open_file(const Path& p) {
    if (!exists(p))
        throw FileNotFoundError(p);
}

// Use optional for optional values
class Config {
    std::optional<std::string> get_string(const std::string& key) const;
};
```

## Backward Compatibility

### Versioning

```cpp
// Version namespace
namespace myapi {
inline namespace v2 {
    class Widget { /* ... */ };
}
}

// Or explicit
namespace myapi {
namespace v1 {
    class Widget { /* old version */ };
}
namespace v2 {
    class Widget { /* new version */ };
}
}
```

### Deprecation

```cpp
class Widget {
public:
    // Mark deprecated
    [[deprecated("Use process_v2() instead")]]
    void process() {
        process_v2();
    }
    
    void process_v2();
};
```

## Const Correctness

```cpp
class Buffer {
    std::vector<char> data_;
    
public:
    // Member function that doesn't modify state
    size_t size() const { return data_.size(); }
    
    // Member function that modifies state - not const
    void clear() { data_.clear(); }
    
    // Returns non-modifying reference - const ref
    const std::vector<char>& buffer() const { return data_; }
};
```

## RAII and Lifetime

```cpp
// RAII for resource management
class File {
public:
    explicit File(const Path& p);
    ~File();  // Automatically closes
    
    // Move only - can't copy file handles
    File(File&& other) noexcept;
    File& operator=(File&& other) noexcept;
    
    File(const File&) = delete;
    File& operator=(const File&) = delete;
};
```

## Builder Pattern

```cpp
class Request {
public:
    class Builder;
    
    static Builder create() { return Builder{}; }
    
    const std::string& url() const { return url_; }
    int timeout() const { return timeout_; }
    const Headers& headers() const { return headers_; }
    
private:
    Request(std::string url, int timeout, Headers headers)
        : url_(std::move(url)), timeout_(timeout), 
          headers_(std::move(headers)) {}
    
    std::string url_;
    int timeout_;
    Headers headers_;
};

class Request::Builder {
public:
    Builder& url(std::string u) { url_ = std::move(u); return *this; }
    Builder& timeout(int t) { timeout_ = t; return *this; }
    Builder& header(Header h) { headers_.push_back(std::move(h)); return *this; }
    
    Request build() {
        return Request(std::move(url_), timeout_, std::move(headers_));
    }
    
private:
    std::string url_ = "http://localhost";
    int timeout_ = 30;
    Headers headers_;
};

// Usage
auto request = Request::create()
    .url("https://api.example.com")
    .timeout(60)
    .header({"Authorization", "Bearer token"})
    .build();
```

## Factory Functions

```cpp
class Widget {
public:
    // Factory for complex construction
    static std::unique_ptr<Widget> create(const Config& config);
    
    // For optional features
    static std::optional<Widget> try_create(const Config& config);
    
    // For fallible construction
    static Result<Widget, Error> create_or_error(const Config& config);
};
```

## Pimpl Idiom

```cpp
// widget.h
class Widget {
public:
    Widget();
    ~Widget();
    
    void do_something();
    
private:
    struct Impl;
    std::unique_ptr<Impl> pimpl_;
};

// widget.cpp
struct Widget::Impl {
    void helper();
    int state_ = 0;
};

Widget::Widget() : pimpl_(std::make_unique<Impl>()) {}
Widget::~Widget() = default;

void Widget::do_something() {
    pimpl_->helper();
}
```

## Best Practices

1. **Minimal interface** - Don't expose internals
2. **Const correctness** - Mark non-modifying functions const
3. **Value semantics** - Prefer copy/move over clone
4. **RAII** - Automatic resource management
5. **Error handling** - Document and be consistent
6. **Deprecation** - Mark old APIs as deprecated

## Resources

- [C++ API Design](https://www.aristeia.com/APIDesign/)
- [Effective C++](https://www.effectivecpp.com/)
