# Coroutines Deep Dive

Comprehensive guide to C++20 coroutines for asynchronous programming and generators.

## Coroutine Basics

### What are Coroutines?

Coroutines are functions that can:
- Suspend execution (yield)
- Resume from where they left off
- Have multiple suspension points

```cpp
#include <coroutine>
#include <iostream>

// Generator coroutine
std::generator<int> count_to(int n) {
    for (int i = 1; i <= n; ++i) {
        co_yield i;  // Suspend and return value
    }
}

int main() {
    for (int i : count_to(5)) {
        std::cout << i << "\n";  // Prints 1, 2, 3, 4, 5
    }
}
```

## std::generator

### Basic Usage

```cpp
#include <coroutine>
#include <vector>

std::generator<int> fibonacci() {
    int a = 0, b = 1;
    while (true) {
        co_yield a;
        int c = a + b;
        a = b;
        b = c;
    }
}

std::generator<int> range(int start, int end) {
    for (int i = start; i < end; ++i) {
        co_yield i;
    }
}

// Usage
for (auto i : range(0, 10)) {
    std::cout << i << " ";
}

for (auto i : fibonacci()) {
    if (i > 1000) break;
    std::cout << i << " ";
}
```

### Filtering and Transforming

```cpp
#include <ranges>

std::generator<int> evens(int n) {
    for (int i = 0; i < n; ++i) {
        if (i % 2 == 0) co_yield i;
    }
}

std::generator<int> doubled() {
    for (auto v : fibonacci()) {
        co_yield v * 2;
    }
}
```

## Custom Coroutine Types

### Promise Type

```cpp
#include <coroutine>
#include <iostream>
#include <optional>

template<typename T>
class Generator {
public:
    struct promise_type {
        std::optional<T> value_;
        
        Generator get_return_object() {
            return Generator{
                std::coroutine_handle<promise_type>::from_promise(*this)
            };
        }
        
        std::suspend_always initial_suspend() { return {}; }
        std::suspend_always final_suspend() noexcept { return {}; }
        
        void return_void() {}
        void unhandled_exception() { throw; }
        
        std::suspend_always yield_value(T value) {
            value_ = std::move(value);
            return {};
        }
    };
    
    std::coroutine_handle<promise_type> handle_;
    
    explicit Generator(std::coroutine_handle<promise_type> h) : handle_(h) {}
    
    ~Generator() { if (handle_) handle_.destroy(); }
    
    T operator()() {
        handle_.resume();
        return std::move(handle_.promise().value_.value());
    }
    
    bool done() const { return handle_.done(); }
};
```

### Async Task

```cpp
#include <coroutine>
#include <future>

template<typename T>
class Task {
public:
    struct promise_type {
        std::optional<T> value_;
        std::exception_ptr exception_;
        
        Task get_return_object() {
            return Task{
                std::coroutine_handle<promise_type>::from_promise(*this)
            };
        }
        
        std::suspend_never initial_suspend() { return {}; }
        std::suspend_never final_suspend() noexcept { return {}; }
        
        void return_value(T v) { value_ = std::move(v); }
        void unhandled_exception() { exception_ = std::current_exception(); }
        
        std::suspend_always yield_value(T v) {
            value_ = std::move(v);
            return {};
        }
    };
    
    std::coroutine_handle<promise_type> handle_;
    
    T get() {
        if (!handle_.done()) handle_.resume();
        if (handle_.promise().exception_) {
            std::rethrow_exception(handle_.promise().exception_);
        }
        return std::move(handle_.promise().value_.value());
    }
};
```

## Awaitables

### Custom Awaitable

```cpp
#include <coroutine>
#include <chrono>

struct sleep_awaitable {
    std::chrono::milliseconds duration_;
    
    bool await_ready() const { return false; }
    
    void await_suspend(std::coroutine_handle<> h) {
        // Schedule resume after duration
        std::thread([h, d = duration_]() {
            std::this_thread::sleep_for(d);
            h.resume();
        }).detach();
    }
    
    void await_resume() {}
};

sleep_awaitable operator co_await(std::chrono::milliseconds ms) {
    return {ms};
}

// Usage
async_task my_coroutine() {
    std::cout << "Starting...\n";
    co_await std::chrono::milliseconds(100);
    std::cout << "Done!\n";
}
```

## Async/Await Pattern

### Task Scheduler

```cpp
#include <coroutine>
#include <queue>
#include <mutex>

class Executor {
    std::queue<std::coroutine_handle<>> tasks_;
    std::mutex mtx_;
    std::condition_variable cv_;
    bool stop_ = false;
    
public:
    void submit(std::coroutine_handle<> h) {
        {
            std::lock_guard lock(mtx_);
            tasks_.push(h);
        }
        cv_.notify_one();
    }
    
    void run() {
        while (true) {
            std::coroutine_handle<> h;
            {
                std::unique_lock lock(mtx_);
                cv_.wait(lock, [this] { return !tasks_.empty() || stop_; });
                if (stop_ && tasks_.empty()) return;
                h = tasks_.front();
                tasks_.pop();
            }
            h.resume();
        }
    }
    
    void stop() {
        {
            std::lock_guard lock(mtx_);
            stop_ = true;
        }
        cv_.notify_all();
    }
};

template<typename T>
struct AwaitableTask {
    // Implementation
};
```

## Cancellation

### Cooperative Cancellation

```cpp
#include <atomic>

struct cancellation_token {
    std::atomic<bool> cancelled_{false};
    
    bool is_cancelled() const { return cancelled_.load(); }
    void cancel() { cancelled_.store(true); }
};

std::generator<int> cancellable_count(cancellation_token& token) {
    for (int i = 0; i < 1000; ++i) {
        if (token.is_cancelled()) co_return;
        co_yield i;
    }
}
```

## Practical Examples

### File Processing

```cpp
std::generator<std::string> read_lines(std::istream& is) {
    std::string line;
    while (std::getline(is, line)) {
        co_yield line;
    }
}

std::generator<std::string> filter_lines(std::generator<std::string> lines,
                                         std::string_view pattern) {
    for (auto&& line : lines) {
        if (line.find(pattern) != std::string::npos) {
            co_yield std::move(line);
        }
    }
}

// Usage
std::ifstream file("data.txt");
for (auto line : filter_lines(read_lines(file), "error")) {
    std::cout << line << "\n";
}
```

### Pipeline

```cpp
template<typename T, typename F>
auto operator|(std::generator<T> gen, F func) {
    return [gen = std::move(gen), func = std::move(func)]() mutable
        -> std::generator<decltype(func(std::declval<T>()))> {
        for (auto&& item : gen) {
            co_yield func(item);
        }
    };
}

// Usage
auto pipeline = read_lines(file)
    | [](std::string& line) { return line.length(); }
    | [](size_t len) { return len > 10; };

for (auto b : pipeline) {
    std::cout << b << "\n";
}
```

## Performance

### Stackless vs Stacked

- **Stackless**: Suspends without full stack copy (C++20 default)
- **Stacked**: Full stack preserved (Go-style)

### Caveats

```cpp
// Coroutines are NOT:
- Threads
- Parallel execution
- Preemptive multitasking

// They ARE:
- Suspendable functions
- Cooperative multitasking
- Lazy evaluation
```

## Best Practices

1. **Use for lazy sequences** - Generators, ranges
2. **Avoid for parallelism** - Use threads for that
3. **Handle cancellation** - Cooperative cancellation
4. **Profile** - Coroutine overhead matters

## Resources

- [cppreference: coroutines](https://en.cppreference.com/w/cpp/language/coroutines)
- [C++20 Coroutines - Microsoft](https://docs.microsoft.com/en-us/cpp/cpp-language/await)
- [Gor Nishanov's Talks](https://channel9.msdn.com/Tags/Coroutines)
