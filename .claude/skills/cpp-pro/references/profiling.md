# Performance Profiling and Optimization

Guide to profiling C++ applications using various tools to identify and fix performance bottlenecks.

## Profiling Tools Overview

| Tool | Platform | Type |
|------|----------|------|
| perf | Linux | Sampling |
| Valgrind/Cachegrind | Cross-platform | Instrumentation |
| VTune | Intel | Sampling |
| Instruments | macOS | Sampling |
| Visual Studio | Windows | Sampling |

## Linux perf

```bash
# Record profile
perf record -g ./myprogram

# Report
perf report

# With call graph
perf record -g --call-graph dwarf ./program

# Specific events
perf record -e cycles -e instructions ./program
perf record -e cache-misses ./program

# CPU profiling
perf stat -e cycles,instructions,cache-references,cache-misses ./program
```

### perf with Flame Graphs

```bash
# Collect data
perf record -F 99 -g ./program

# Generate flame graph
git clone https://github.com/brendangregg/FlameGraph
perf script | ./FlameGraph/stackcollapse-perf.pl | \
    ./FlameGraph/flamegraph.pl > flamegraph.svg
```

## Valgrind

### Callgrind

```bash
# Profile with callgrind
valgrind --tool=callgrind ./program

# View with KCachegrind
kcachegrind callgrind.out.12345
```

### Cache Analysis

```bash
# Cachegrind
valgrind --tool=cachegrind ./program

# Branch prediction
valgrind --tool=branchprof ./program
```

## Intel VTune

```bash
# Command line
vtune -collect hotspots ./myprogram
vtune -report summary

# GUI
vtune-gui
```

### VTune API

```cpp
#include <ittnotify.h>

__itt_domain* domain = __itt_domain_create("MyApp");
__itt_string_handle* handle = __itt_string_handle_create("Task");

void task() {
    __itt_task_begin(domain, __itt_null, __itt_null, handle);
    // Work
    __itt_task_end(domain);
}
```

## Hotspot Analysis

### Identifying Hotspots

1. **CPU-bound**: High CPU usage, find innermost loops
2. **Memory-bound**: Cache misses, memory bandwidth
3. **I/O-bound**: Disk/network waiting

### Common Issues

```cpp
// ISSUE: Unnecessary copies
void bad_copy(std::vector<Data> v) {  // Copies!
    for (const auto& item : v) {
        process(item);
    }
}

// FIX: Pass by reference
void good_copy(const std::vector<Data>& v) {
    for (const auto& item : v) {
        process(item);
    }
}

// ISSUE: Redundant allocations
void bad_allocate() {
    std::string s;
    for (int i = 0; i < 1000; ++i) {
        s += std::to_string(i);  // Reallocates each time
    }
}

// FIX: Reserve
void good_allocate() {
    std::string s;
    s.reserve(4000);
    for (int i = 0; i < 1000; ++i) {
        s += std::to_string(i);
    }
}

// ISSUE: O(n²) algorithm
void bad_algorithm(const std::vector<int>& v) {
    for (size_t i = 0; i < v.size(); ++i) {
        if (std::find(v.begin(), v.end(), v[i]) != v.end()) {
            // ...
        }
    }
}

// FIX: Use set for O(1) lookup
void good_algorithm(const std::vector<int>& v) {
    std::unordered_set<int> s(v.begin(), v.end());
    for (const auto& item : v) {
        if (s.count(item)) {
            // ...
        }
    }
}
```

## Cache Optimization

### Cache Miss Analysis

```cpp
// ISSUE: Poor cache locality (stride-1 access is best)
const int N = 1000;
float matrix[N][N];

// Column-major access - cache unfriendly
for (int j = 0; j < N; ++j)
    for (int i = 0; i < N; ++i)
        process(matrix[i][j]);

// Row-major access - cache friendly
for (int i = 0; i < N; ++i)
    for (int j = 0; j < N; ++j)
        process(matrix[i][j]);

// ISSUE: False sharing
struct Counter { std::atomic<uint64_t> count; };
std::vector<Counter> counters(10);

// Each thread increments different counter
// But they share a cache line!

// FIX: Padding
struct PaddedCounter {
    alignas(64) std::atomic<uint64_t> count;  // Cache-line aligned
};
```

### Prefetching

```cpp
// Manual prefetch
void process_with_prefetch(float* data, size_t n) {
    for (size_t i = 0; i < n; ++i) {
        // Prefetch 3 iterations ahead
        if (i + 3 < n) {
            __builtin_prefetch(&data[i + 3], 0, 3);
        }
        process(data[i]);
    }
}
```

## Memory Profiling

### Heap Tracking

```bash
# Valgrind massif
valgrind --tool=massif ./program
ms_print massif.out.12345
```

### Address Sanitizer

```bash
# Compile with ASan
g++ -fsanitize=address -g program.cpp -o program
./program

# With leak detection
g++ -fsanitize=address,leak -g program.cpp -o program
```

## Branch Prediction

### Likely/Unlikely

```cpp
// Branch hints
#define likely(x) __builtin_expect(!!(x), 1)
#define unlikely(x) __builtin_expect(!!(x), 0)

if (unlikely(error_condition)) {
    handle_error();
}

// Compiler can layout code to reduce misprediction
```

## Best Practices

1. **Profile before optimizing** - Don't guess
2. **Use appropriate tools** - CPU, memory, I/O
3. **Measure impact** - Before and after
4. **Focus on hot paths** - 10% of code often takes 90% of time
5. **Amdahl's Law** - Optimize where it matters

## Resources

- [perf wiki](https://perf.wiki.kernel.org/)
- [VTune Documentation](https://software.intel.com/content/www/us/en/develop/documentation/vtune-help/top.html)
- [Brendan Gregg's Performance Tools](https://www.brendangregg.com/linuxperf.html)
