# Secure C++ Programming

Guide to writing secure C++ code, covering common vulnerabilities and mitigation strategies.

## Buffer Overflows

```cpp
#include <cstring>
#include <algorithm>

// DANGEROUS - buffer overflow
void dangerous_copy(char* dest, const char* src) {
    strcpy(dest, src);  // No bounds checking!
}

// SAFE - use safe functions
void safe_copy(char* dest, size_t dest_size, const char* src) {
    strncpy(dest, src, dest_size - 1);
    dest[dest_size - 1] = '\0';
}

// SAFEST - use std::string or safe libraries
std::string safe_copy(const std::string& src) {
    return src;  // Automatic memory management
}

// Avoid fixed-size buffers with user input
void process_input(const std::string& input) {
    std::vector<char> buffer(input.begin(), input.end());
    buffer.push_back('\0');
    // Process safely
}
```

## Integer Overflow

```cpp
#include <cstdint>
#include <climits>

// DANGEROUS - integer overflow
size_t dangerous_size(int user_count) {
    return user_count * sizeof(User);  // Overflow possible!
}

// SAFE - check before arithmetic
size_t safe_size(int user_count) {
    if (user_count < 0) return 0;
    constexpr size_t max = SIZE_MAX / sizeof(User);
    if (static_cast<size_t>(user_count) > max) {
        return max;
    }
    return static_cast<size_t>(user_count) * sizeof(User);
}

// Use safe integer types
#include <safe_int/safe_types.hpp>
using namespace si;

safe_int<int, 0, 1000> user_count;  // Range-limited
```

## Input Validation

```cpp
#include <algorithm>
#include <cctype>

// Validate string input
bool is_valid_filename(const std::string& name) {
    if (name.empty() || name.length() > 255) return false;
    
    // Check for path traversal
    if (name.find("..") != std::string::npos) return false;
    
    // Check for invalid characters
    const std::string invalid_chars = "/\\:*?\"<>|";
    if (name.find_first_of(invalid_chars) != std::string::npos) {
        return false;
    }
    
    return true;
}

// Sanitize for SQL (use parameterized queries instead!)
std::string sanitize_sql(const std::string& input) {
    std::string result;
    result.reserve(input.size());
    for (char c : input) {
        if (c == '\'') result += "''";  // Escape single quotes
        else result += c;
    }
    return result;
    // BETTER: Use parameterized queries instead!
}

// Validate numeric ranges
bool validate_range(int value, int min, int max) {
    return value >= min && value <= max;
}
```

## Resource Management

```cpp
#include <memory>

// RAII for all resources
class FileHandle {
    FILE* file_;
public:
    FileHandle(const char* path, const char* mode) 
        : file_(fopen(path, mode)) {
        if (!file_) throw std::runtime_error("Failed to open");
    }
    ~FileHandle() { if (file_) fclose(file_); }
    FileHandle(const FileHandle&) = delete;
    FileHandle& operator=(const FileHandle&) = delete;
};

// Smart pointers for memory
void safe_allocation() {
    auto ptr = std::make_unique<int>(42);
    // Automatically deleted when ptr goes out of scope
}

// Handle leaks
void check_leaks() {
    // Use smart pointers or RAII always
}
```

## Secure Random

```cpp
#include <random>
#include <array>

// Cryptographically secure random
#include <openssl/rand.h>

std::array<uint8_t, 32> secure_random_bytes() {
    std::array<uint8_t, 32> bytes;
    if (RAND_bytes(bytes.data(), bytes.size()) != 1) {
        throw std::runtime_error("Random generation failed");
    }
    return bytes;
}

// For non-crypto: std::random_device is adequate
std::random_device rd;
std::mt19937 gen(rd());
std::uniform_int_distribution<> dis(1, 6);
```

## Timing Attacks

```cpp
#include <chrono>

// Constant-time comparison
bool constant_time_compare(const uint8_t* a, const uint8_t* b, size_t len) {
    uint8_t result = 0;
    for (size_t i = 0; i < len; ++i) {
        result |= a[i] ^ b[i];
    }
    return result == 0;
}

// DANGEROUS - timing leak
bool unsafe_compare(const std::string& a, const std::string& b) {
    return a == b;  // Short-circuits on first diff
}

// Use constant-time for secrets
bool verify_password(const std::string& stored_hash, 
                    const std::string& provided) {
    auto hash = hash_password(provided);
    return constant_time_compare(
        reinterpret_cast<const uint8_t*>(hash.data()),
        reinterpret_cast<const uint8_t*>(stored_hash.data()),
        hash.size()
    );
}
```

## Thread Safety

```cpp
#include <mutex>

// Thread-safe singleton
class SecureSingleton {
public:
    static SecureSingleton& get() {
        static SecureSingleton instance;  // Thread-safe in C++11+
        return instance;
    }
    
private:
    SecureSingleton() = default;
    SecureSingleton(const SecureSingleton&) = delete;
    SecureSingleton& operator=(const SecureSingleton&) = delete;
};

// Data race protection
class ThreadSafeCounter {
    mutable std::mutex mtx_;
    int count_ = 0;
    
public:
    int increment() {
        std::lock_guard lock(mtx_);
        return ++count_;
    }
    
    int get() const {
        std::lock_guard lock(mtx_);
        return count_;
    }
};
```

## Secure Coding Guidelines

| Rule | Description |
|------|-------------|
| Input validation | Validate all external input |
| Output encoding | Encode output for destination context |
| Authentication | Use strong, modern algorithms |
| Session management | Use secure, random session IDs |
| Error handling | Don't leak sensitive information |
| Logging | Don't log secrets |
| Memory | Use safe functions, avoid overflows |
| Crypto | Use proven libraries, not custom crypto |

## Best Practices

1. **Validate all input** - Never trust user data
2. **Use safe functions** - strncpy, snprintf instead of strcpy, sprintf
3. **Use modern C++** - Smart pointers, containers
4. **Don't roll your own crypto** - Use OpenSSL, libsodium
5. **Use static analysis** - Clang-Tidy, Coverity
6. **Fuzz test** - Find vulnerabilities
7. **Keep dependencies updated** - Security patches

## Resources

- [CWE Common Weakness Enumeration](https://cwe.mitre.org/)
- [CERT C++ Secure Coding](https://wiki.sei.cmu.edu/confluence/display/cplusplus/SEI+CERT+C+++Coding+Standard)
- [OWASP](https://owasp.org/)
