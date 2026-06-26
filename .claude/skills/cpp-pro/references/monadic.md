# Monadic Operations

Guide to using monadic operations with std::optional, std::variant, and std::expected.

## Monadic Operations Overview

Monadic operations allow chaining operations on optional/variant values without explicit checking.

## std::optional

### transform

```cpp
#include <optional>

std::optional<int> parse_int(const std::string& s) {
    try {
        return std::stoi(s);
    } catch (...) {
        return std::nullopt;
    }
}

// Without monadic (verbose)
std::optional<int> result = parse_int("42");
if (result) {
    auto doubled = *result * 2;
}

// With transform (clean)
auto doubled = parse_int("42")
    .transform([](int n) { return n * 2; });

// Chaining
auto final = parse_int("42")
    .transform([](int n) { return n * 2; })
    .transform([](int n) { return std::to_string(n); });
```

### and_then

```cpp
// Chain operations that return optional
std::optional<int> parse_and_double(const std::string& s) {
    return parse_int(s)
        .and_then([](int n) {
            if (n > 0) return std::optional<int>(n * 2);
            return std::optional<int>(std::nullopt);
        });
}

// Database lookup chain
std::optional<User> find_user(int id);
std::optional<Profile> find_profile(const User& user);
std::optional<Settings> get_settings(const Profile& profile);

auto get_settings(int user_id) {
    return find_user(user_id)
        .and_then(find_profile)
        .and_then(get_settings);
}
```

### or_else

```cpp
// Provide alternative on failure
auto get_value(int key) {
    return cache_lookup(key)
        .or_else([&] { return database_lookup(key); })
        .or_else([] { return default_value(); });
}

// Transform error to different optional
auto get_config() {
    return load_from_file()
        .or_else([] { return load_from_env(); })
        .or_else([] { return load_defaults(); });
}
```

## std::variant

### visit

```cpp
#include <variant>

using Value = std::variant<int, double, std::string>;

void process(const Value& v) {
    // Lambda visitor
    std::visit([](const auto& val) {
        using T = std::decay_t<decltype(val)>;
        if constexpr (std::is_integral_v<T>) {
            std::cout << "Integer: " << val << "\n";
        } else if constexpr (std::is_floating_point_v<T>) {
            std::cout << "Float: " << val << "\n";
        } else {
            std::cout << "String: " << val << "\n";
        }
    }, v);
}
```

### Match (C++23)

```cpp
// C++23 pattern matching
using Value = std::variant<int, double, std::string>;

void process(const Value& v) {
    std::match(v,
        [](int i) { std::cout << "int: " << i; },
        [](double d) { std::cout << "double: " << d; },
        [](const std::string& s) { std::cout << "string: " << s; }
    );
}
```

## std::expected (C++23)

### transform

```cpp
#include <expected>

std::expected<int, std::string> parse_int(const std::string& s) {
    try {
        return std::stoi(s);
    } catch (...) {
        return std::unexpected("Parse error");
    }
}

// Chain transformations
auto result = parse_int("42")
    .transform([](int n) { return n * 2; })
    .transform([](int n) { return std::to_string(n); });
```

### and_then

```cpp
// Chain operations that might fail
std::expected<User, Error> get_user(int id);
std::expected<Order, Error> get_order(const User& user);

auto get_order_for_user(int user_id) {
    return get_user(user_id)
        .and_then(get_order);
}
```

### or_else

```cpp
// Recover from errors
auto get_data() {
    return fetch_from_cache()
        .or_else([](const Error& e) {
            log_error(e);
            return fetch_from_database();
        })
        .or_else([](const Error&) {
            return fetch_from_api();
        });
}

// Map error type
auto get_config() {
    return load_config()
        .transform_error([](ParseError e) {
            return ConfigError{e.message()};
        });
}
```

## Custom Monadic Types

### Option-like Type

```cpp
template<typename T>
class Option {
public:
    template<typename F>
    auto map(F f) -> Option<decltype(f(std::declval<T>()))> {
        if (has_value_) {
            return Option(f(value_));
        }
        return Option::none();
    }
    
    template<typename F>
    auto flat_map(F f) -> decltype(f(std::declval<T>())) {
        if (has_value_) {
            return f(value_);
        }
        return decltype(f(std::declval<T>()))::none();
    }
    
    template<typename F>
    auto or_else(F f) -> Option<T> {
        if (has_value_) {
            return *this;
        }
        return f();
    }
    
    T value_or(T default_val) {
        return has_value_ ? value_ : default_val;
    }
    
    bool has_value() const { return has_value_; }
    
    static Option none() { return Option(); }
    
private:
    explicit Option(const T& v) : value_(v), has_value_(true) {}
    Option() : has_value_(false) {}
    
    T value_;
    bool has_value_;
};
```

## Best Practices

1. **Use transform** - For mapping to new type
2. **Use and_then** - For chaining fallible operations
3. **Use or_else** - For error recovery
4. **Avoid explicit checks** - Let monads handle it
5. **Compose operations** - Build pipelines

## Resources

- [std::optional documentation](https://en.cppreference.com/w/cpp/utility/optional)
- [std::expected proposal](http://www.open-std.org/jtc1/sc22/wg21/docs/papers/2019/p0323r10.html)
