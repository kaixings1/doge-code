# Fuzzing

Comprehensive guide to fuzz testing in C++, covering libfuzzer, AFL++, and fuzzing best practices.

## libfuzzer

### Basic Setup

```cpp
#include <cstdint>
#include <cstddef>

// Fuzz target function
extern "C" int LLVMFuzzerTestOneInput(const uint8_t* data, size_t size) {
    if (size < 4) return 0;
    
    // Your parsing/handling code here
    std::string input(reinterpret_cast<const char*>(data), size);
    
    // Parse JSON
    try {
        auto parsed = json::parse(input);
        // Process parsed data
    } catch (const std::exception&) {
        // Ignore parse errors - they're expected
    }
    
    return 0;
}
```

### Building

```bash
# Compile with sanitizer and fuzzing
clang++ -fsanitize=address,fuzzer -g -O1 fuzz_target.cc -o fuzz_target

# Run
./fuzz_target

# With corpus
./fuzz_target corpus_dir/

# With dictionary
./fuzz_target corpus_dir/ -dict=my.dict
```

### Dictionary

```
# my.dict
"http://"
"https://"
"\"name\":"
"\"value\":"
"null"
"true"
"false"
```

### Complex Fuzzing

```cpp
#include <cstdint>
#include <cstddef>
#include <vector>

// Multiple mutation strategies
struct ProtocolMessage {
    uint8_t type;
    uint16_t length;
    std::vector<uint8_t> payload;
};

extern "C" int LLVMFuzzerTestOneInput(const uint8_t* data, size_t size) {
    if (size < 3) return 0;
    
    // Parse header
    uint8_t type = data[0];
    uint16_t length = (data[1] << 8) | data[2];
    
    if (size < 3 + length) return 0;
    
    // Process based on type
    switch (type) {
        case 0x01:  // Text message
            handle_text(reinterpret_cast<const char*>(data + 3), length);
            break;
        case 0x02:  // Binary message
            handle_binary(data + 3, length);
            break;
        case 0x03:  // JSON message
            handle_json(std::string(reinterpret_cast<const char*>(data + 3), length));
            break;
        default:
            return 0;  // Unknown type - don't crash
    }
    
    return 0;
}

void handle_text(const char* data, size_t len) {
    // Process text
}

void handle_binary(const uint8_t* data, size_t len) {
    // Process binary
}

void handle_json(const std::string& json_str) {
    auto parsed = json::parse(json_str);
    // Process
}
```

## AFL++

### Instrumentation

```bash
# Compile with AFL++ instrumentation
afl-clang-fast++ -g -O2 -o myprogram myprogram.cc

# For library
afl-clang-fast++ -shared -fPIC -g -o libmylib.so mylib.cc

# With QEMU (no source)
afl-qemu-trace -o myprogram_qemu ./myprogram
```

### Running

```bash
# Fuzz with test cases
afl-fuzz -i testcases/ -o output/ ./myprogram @@

# Parallel fuzzing
afl-fuzz -i testcases/ -o output1/ -M main ./myprogram @@
afl-fuzz -i testcases/ -o output2/ -S secondary ./myprogram @@
```

## Fuzzing Strategies

### Corpus Minimization

```bash
# Minimize corpus
afl-tmin -i corpus/ -o minimized/ -x @@ -- ./program

# Or with libFuzzer (automatic)
clang++ -fsanitize=coverage fuzzer.cc
./fuzzer corpus_minimized/
```

### Differential Fuzzing

```cpp
#include <cstdint>
#include <cstddef>

extern "C" int LLVMFuzzerTestOneInput(const uint8_t* data, size_t size) {
    // Parse with both implementations
    try {
        auto result_v1 = parse_v1(data, size);
        auto result_v2 = parse_v2(data, size);
        
        // Results should match
        if (result_v1 != result_v2) {
            // Inconsistency found - potential bug!
            abort();
        }
    } catch (...) {
        // Both should either succeed or fail
    }
    
    return 0;
}
```

### Grammar-Based Fuzzing

```cpp
#include <random>
#include <cstdint>

class GrammarFuzzer {
    std::mt19937 rng_{std::random_device{}()};
    
public:
    // Context-free grammar
    std::map<std::string, std::vector<std::vector<std::string>>> grammar_ = {
        {"<start>", {{"<expr>"}},
        {"<expr>", {{"<term>", "<expr> <op> <term>"}},
        {"<term>", {{"<number>", "( <expr> )"}},
        {"<number>", {{"<digit>", "<number> <digit>"}},
        {"<digit>", {{"0"}, {"1"}, {"2"}, {"3"}, {"4"}, {"5"}, {"6"}, {"7"}, {"8"}, {"9"}}},
        {"<op>", {{"+"}, {"-"}, {"*"}, {"/"}}}
    };
    
    std::string generate(const std::string& symbol) {
        auto& rules = grammar_[symbol];
        auto& rule = rules[rng_() % rules.size()];
        
        std::string result;
        for (const auto& sym : rule) {
            if (sym.starts_with('<')) {
                result += generate(sym);
            } else {
                result += sym;
            }
        }
        return result;
    }
};
```

## Best Practices

1. **Start with valid inputs** - Use real-world samples as corpus
2. **Minimize corpus** - Faster fuzzing, better coverage
3. **Use dictionaries** - Help fuzzer understand format
4. **Enable coverage** - Track what's being exercised
5. **Reproduce crashes** - Write tests for found issues
6. **Continuous fuzzing** - Run in CI/CD
7. **Multiple fuzzers** - Different strategies find different bugs
8. **Don't ignore crashes** - Check for false positives but investigate

## Integration

```yaml
# GitHub Actions
name: Fuzz
on: [push, pull_request]
jobs:
  fuzz:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Build with AFL++
        run: |
          sudo apt-get install -y afl++
          afl-clang-fast++ -g -O1 fuzz_target.cc -o fuzz_target
      - name: Fuzz
        run: |
          mkdir -p corpus
          echo "test" > corpus/test
          afl-fuzz -i corpus -o output -- ./fuzz_target @@
```

## Resources

- [libFuzzer Documentation](https://llvm.org/docs/LibFuzzer.html)
- [AFL++](https://github.com/AFLplusplus/AFLplusplus)
- [Fuzzing Book](https://www.fuzzingbook.org/)
