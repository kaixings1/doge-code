# Advanced Concurrency

Comprehensive guide to advanced concurrency patterns in modern C++, covering atomics, futures/promises, thread pools, and concurrent data structures.

## Atomics

### Basic Operations

```cpp
#include <atomic>

std::atomic<int> counter(0);

// Atomic load/store
int value = counter.load();
counter.store(42);

// Fetch operations
counter.fetch_add(1);  // Returns old value
counter.fetch_sub(1);
counter.fetch_and(0xF);
counter.fetch_or(0xF);
counter.exchange(42);  // Returns old value

// Operator shortcuts
counter++;            // fetch_add(1)
counter += 5;         // fetch_add(5)
```

### Memory Order

```cpp
// Sequentially consistent (default, strongest)
std::atomic<int> x(0), y(0);
x.store(1, std::memory_order_seq_cst);
y.store(1, std::memory_order_seq_cst);

// Acquire-release (synchronizes with release on same atomic)
std::atomic<bool> ready(false);
std::atomic<int> data(0);

// Thread 1 (producer)
data.store(42, std::memory_order_release);
ready.store(true, std::memory_order_release);

// Thread 2 (consumer)
while (!ready.load(std::memory_order_acquire)) {}
int val = data.load(std::memory_order_acquire);

// Relaxed (no synchronization, only atomicity)
std::atomic<int> counter(0);
counter.fetch_add(1, std::memory_order_relaxed);
```

### Lock-Free Data Structures

```cpp
// Lock-free stack
template<typename T>
class LockFreeStack {
    struct Node {
        T data;
        Node* next;
        Node(T d) : data(std::move(d)), next(nullptr) {}
    };
    
    std::atomic<Node*> head_;
    
public:
    void push(T value) {
        Node* new_node = new Node(std::move(value));
        new_node->next = head_.load(std::memory_order_relaxed);
        while (!head_.compare_exchange_weak(
            new_node->next, 
            new_node,
            std::memory_order_release,
            std::memory_order_relaxed
        )) {
            // new_node->next updated by compare_exchange_weak
        }
    }
    
    std::optional<T> pop() {
        Node* old_head = head_.load(std::memory_order_acquire);
        while (old_head) {
            Node* next = old_head->next;
            if (head_.compare_exchange_weak(
                old_head, next,
                std::memory_order_release,
                std::memory_order_acquire
            )) {
                T value = std::move(old_head->data);
                delete old_head;
                return value;
            }
        }
        return std::nullopt;
    }
};
```

## Futures and Promises

### std::future and std::promise

```cpp
#include <future>

void async_work(std::promise<int>& prom) {
    // Do work
    int result = compute();
    prom.set_value(result);
    
    // Or set exception
    // prom.set_exception(std::make_exception_ptr(std::runtime_error("error")));
}

int main() {
    std::promise<int> prom;
    std::future<int> fut = prom.get_future();
    
    std::thread worker(async_work, std::ref(prom));
    
    int result = fut.get();  // Blocks until value available
    worker.join();
    
    std::cout << result << '\n';
}
```

### std::async

```cpp
#include <future>

int heavy_computation(int x) {
    // CPU-intensive work
    return x * x;
}

int main() {
    // Launch async
    std::future<int> fut1 = std::async(std::launch::async, heavy_computation, 10);
    std::future<int> fut2 = std::async(std::launch::async, heavy_computation, 20);
    
    // Multiple futures run concurrently
    int result = fut1.get() + fut2.get();
    
    // With deferred (lazy evaluation)
    std::future<int> fut3 = std::async(std::launch::deferred, heavy_computation, 30);
}
```

### std::packaged_task

```cpp
#include <future>
#include <vector>

int task(int x) { return x * 2; }

int main() {
    std::vector<std::future<int>> futures;
    std::vector<std::packaged_task<int(int)>> tasks;
    
    for (int i = 0; i < 4; ++i) {
        tasks.emplace_back(task);
        futures.push_back(tasks.back().get_future());
    }
    
    // Execute tasks
    std::vector<std::thread> threads;
    for (int i = 0; i < 4; ++i) {
        threads.emplace_back(std::move(tasks[i]), i);
    }
    
    for (auto& t : threads) t.join();
    
    for (auto& f : futures) {
        std::cout << f.get() << '\n';
    }
}
```

### std::shared_future

```cpp
#include <future>

std::promise<void> ready_prom;
std::shared_future<void> ready = ready_prom.get_future().share();

// Multiple threads can wait on same future
auto wait_and_print = [](int id) {
    ready.wait();  // Blocks
    std::cout << id << " ready\n";
};

std::thread t1(wait_and_print, 1);
std::thread t2(wait_and_print, 2);

ready_prom.set_value();
t1.join();
t2.join();
```

## Thread Pools

### Basic Thread Pool

```cpp
#include <thread>
#include <queue>
#include <functional>
#include <mutex>
#include <condition_variable>

class ThreadPool {
    std::vector<std::thread> workers_;
    std::queue<std::function<void()>> tasks_;
    std::mutex queue_mutex_;
    std::condition_variable cv_;
    bool stop_ = false;
    
public:
    explicit ThreadPool(size_t threads) {
        for (size_t i = 0; i < threads; ++i) {
            workers_.emplace_back([this] {
                while (true) {
                    std::function<void()> task;
                    {
                        std::unique_lock lock(queue_mutex_);
                        cv_.wait(lock, [this] { 
                            return stop_ || !tasks_.empty(); 
                        });
                        
                        if (stop_ && tasks_.empty()) return;
                        task = std::move(tasks_.front());
                        tasks_.pop();
                    }
                    task();
                }
            });
        }
    }
    
    template<typename F>
    auto submit(F&& f) -> std::future<std::invoke_result_t<F>> {
        using R = std::invoke_result_t<F>;
        auto task_ptr = std::make_shared<std::packaged_task<R()>>(
            std::forward<F>(f)
        );
        
        {
            std::lock_guard lock(queue_mutex_);
            tasks_.push([task_ptr] { (*task_ptr)(); });
        }
        cv_.notify_one();
        
        return task_ptr->get_future();
    }
    
    ~ThreadPool() {
        {
            std::lock_guard lock(queue_mutex_);
            stop_ = true;
        }
        cv_.notify_all();
        for (auto& w : workers_) w.join();
    }
};
```

### Work-Stealing Thread Pool

```cpp
#include <deque>
#include <thread>
#include <random>

class WorkStealingPool {
    const size_t num_threads_;
    std::vector<std::deque<std::function<void()>>> queues_;
    std::vector<std::thread> threads_;
    std::atomic<bool> done_{false};
    
public:
    explicit WorkStealingPool(size_t n) : num_threads_(n), queues_(n) {
        for (size_t i = 0; i < n; ++i) {
            threads_.emplace_back([this, i] { worker_loop(i); });
        }
    }
    
    template<typename F>
    void submit(F&& f) {
        size_t owner = random_thread();
        std::lock_guard lock(mutexes_[owner]);
        queues_[owner].push_back(std::forward<F>(f));
        cvs_[owner].notify_one();
    }
    
    ~WorkStealingPool() {
        done_ = true;
        for (auto& cv : cvs_) cv.notify_all();
        for (auto& t : threads_) t.join();
    }
    
private:
    void worker_loop(size_t my_id) {
        while (!done_) {
            std::function<void()> task;
            
            // Try own queue first
            {
                std::lock_guard lock(mutexes_[my_id]);
                if (!queues_[my_id].empty()) {
                    task = std::move(queues_[my_id].front());
                    queues_[my_id].pop_front();
                }
            }
            
            // Steal from others
            if (!task) {
                for (size_t i = 0; i < num_threads_; ++i) {
                    size_t victim = (my_id + i + 1) % num_threads_;
                    {
                        std::lock_guard lock(mutexes_[victim]);
                        if (!queues_[victim].empty()) {
                            task = std::move(queues_[victim].front());
                            queues_[victim].pop_front();
                            break;
                        }
                    }
                }
            }
            
            if (task) {
                task();
            } else {
                std::this_thread::sleep_for(std::chrono::microseconds(1));
            }
        }
    }
};
```

## Thread-Safe Data Structures

### Thread-Safe Queue

```cpp
#include <queue>
#include <mutex>
#include <condition_variable>

template<typename T>
class ThreadSafeQueue {
    std::queue<T> queue_;
    mutable std::mutex mutex_;
    std::condition_variable cv_;
    
public:
    void push(T value) {
        {
            std::lock_guard lock(mutex_);
            queue_.push(std::move(value));
        }
        cv_.notify_one();
    }
    
    std::optional<T> pop() {
        std::lock_guard lock(mutex_);
        if (queue_.empty()) return std::nullopt;
        
        T value = std::move(queue_.front());
        queue_.pop();
        return value;
    }
    
    std::optional<T> wait_and_pop() {
        std::unique_lock lock(mutex_);
        cv_.wait(lock, [this] { return !queue_.empty(); });
        
        T value = std::move(queue_.front());
        queue_.pop();
        return value;
    }
    
    bool try_pop(T& value) {
        std::lock_guard lock(mutex_);
        if (queue_.empty()) return false;
        value = std::move(queue_.front());
        queue_.pop();
        return true;
    }
};
```

### Thread-Safe Map

```cpp
#include <map>
#include <shared_mutex>

template<typename K, typename V>
class ThreadSafeMap {
    std::map<K, V> data_;
    mutable std::shared_mutex mutex_;
    
public:
    // Read operations - multiple readers
    std::optional<V> find(const K& key) const {
        std::shared_lock lock(mutex_);
        auto it = data_.find(key);
        if (it != data_.end()) return it->second;
        return std::nullopt;
    }
    
    bool contains(const K& key) const {
        std::shared_lock lock(mutex_);
        return data_.find(key) != data_.end();
    }
    
    // Write operations - exclusive access
    void insert_or_assign(const K& key, V value) {
        std::unique_lock lock(mutex_);
        data_[key] = std::move(value);
    }
    
    std::optional<V> erase(const K& key) {
        std::unique_lock lock(mutex_);
        auto it = data_.find(key);
        if (it == data_.end()) return std::nullopt;
        V value = std::move(it->second);
        data_.erase(it);
        return value;
    }
};
```

### Ring Buffer (Single Producer Consumer)

```cpp
#include <atomic>
#include <array>

template<typename T, size_t N>
class SPSCQueue {
    static_assert((N & (N - 1)) == 0, "N must be power of 2");
    
    std::array<T, N> buffer_;
    alignas(64) std::atomic<size_t> write_{0};
    alignas(64) std::atomic<size_t> read_{0};
    
public:
    bool push(const T& value) {
        size_t w = write_.load(std::memory_order_relaxed);
        size_t r = read_.load(std::memory_order_acquire);
        
        if ((w - r) >= N) return false;  // Full
        
        buffer_[w & (N - 1)] = value;
        write_.store(w + 1, std::memory_order_release);
        return true;
    }
    
    std::optional<T> pop() {
        size_t r = read_.load(std::memory_order_relaxed);
        size_t w = write_.load(std::memory_order_acquire);
        
        if (w == r) return std::nullopt;  // Empty
        
        T value = std::move(buffer_[r & (N - 1)]);
        read_.store(r + 1, std::memory_order_release);
        return value;
    }
};
```

## Synchronization Patterns

### Barrier

```cpp
#include <barrier>
#include <thread>
#include <vector>

int main() {
    const size_t num_threads = 4;
    std::barrier sync(num_threads);
    std::vector<int> results(num_threads);
    
    auto worker = [&](size_t id) {
        // Phase 1: Computation
        results[id] = id * id;
        sync.arrive_and_wait();
        
        // Phase 2: Use results from all threads
        int sum = 0;
        for (int r : results) sum += r;
        
        sync.arrive_and_wait();
    };
    
    std::vector<std::thread> threads;
    for (size_t i = 0; i < num_threads; ++i) {
        threads.emplace_back(worker, i);
    }
    
    for (auto& t : threads) t.join();
}
```

### Latch

```cpp
#include <latch>
#include <thread>
#include <vector>

int main() {
    std::latch work_done(3);
    
    auto worker = [&](int id) {
        // Do work
        std::this_thread::sleep_for(std::chrono::milliseconds(100));
        work_done.count_down();
    };
    
    std::thread t1(worker, 1);
    std::thread t2(worker, 2);
    std::thread t3(worker, 3);
    
    work_done.wait();  // Blocks until count reaches 0
    
    std::cout << "All work done\n";
    
    t1.join(); t2.join(); t3.join();
}
```

### Semaphore

```cpp
#include <semaphore>
#include <thread>
#include <vector>

int main() {
    std::counting_semaphore<3> resources(3);  // 3 available
    
    auto use_resource = [&](int id) {
        resources.acquire();
        std::cout << "Thread " << id << " using resource\n";
        std::this_thread::sleep_for(std::chrono::milliseconds(100));
        std::cout << "Thread " << id << " releasing\n";
        resources.release();
    };
    
    std::vector<std::thread> threads;
    for (int i = 0; i < 5; ++i) {
        threads.emplace_back(use_resource, i);
    }
    
    for (auto& t : threads) t.join();
}
```

## Condition Variables

```cpp
#include <mutex>
#include <condition_variable>
#include <queue>

template<typename T>
class BlockingQueue {
    std::queue<T> queue_;
    mutable std::mutex mutex_;
    std::condition_variable cv_;
    size_t max_size_;
    
public:
    explicit BlockingQueue(size_t max) : max_size_(max) {}
    
    void push(T value) {
        {
            std::unique_lock lock(mutex_);
            cv_.wait(lock, [this] { return queue_.size() < max_size_; });
            queue_.push(std::move(value));
        }
        cv_.notify_one();
    }
    
    std::optional<T> pop() {
        std::unique_lock lock(mutex_);
        cv_.wait(lock, [this] { return !queue_.empty(); });
        
        T value = std::move(queue_.front());
        queue_.pop();
        cv_.notify_one();
        return value;
    }
    
    bool try_push(T value) {
        {
            std::unique_lock lock(mutex_);
            if (queue_.size() >= max_size_) return false;
            queue_.push(std::move(value));
        }
        cv_.notify_one();
        return true;
    }
};
```

## Parallel Algorithms (C++17)

```cpp
#include <execution>
#include <algorithm>
#include <numeric>
#include <vector>

int main() {
    std::vector<int> data(1000000);
    std::iota(data.begin(), data.end(), 1);
    
    // Parallel sort
    std::sort(std::execution::par, data.begin(), data.end());
    
    // Parallel reduce (sum)
    int sum = std::reduce(std::execution::par, 
                          data.begin(), data.end(), 0);
    
    // Parallel transform
    std::vector<int> result(data.size());
    std::transform(std::execution::par_unseq,
                   data.begin(), data.end(), result.begin(),
                   [](int x) { return x * 2; });
    
    // Parallel for_each
    std::for_each(std::execution::par, 
                  data.begin(), data.end(),
                  [](int& x) { x += 1; });
}
```

## Thread-Local Storage

```cpp
#include <thread>

// Thread-local keyword
thread_local int counter = 0;

void worker() {
    counter++;
    std::cout << "Thread " << std::this_thread::get_id() 
              << " counter: " << counter << '\n';
}

int main() {
    std::thread t1(worker);
    std::thread t2(worker);
    t1.join();
    t2.join();
    // Each thread has its own counter (prints 1 for each)
}
```

## Common Pitfalls

1. **Deadlock** - Always acquire locks in consistent order
2. **Race conditions** - Protect shared data with mutexes/atomics
3. **Starvation** - Use fair locks or avoid long critical sections
4. **False sharing** - Pad data structures to cache line size
5. **Excessive synchronization** - Minimize lock contention
6. **Memory order mistakes** - Use seq_cst unless you need performance
7. **Not joining threads** - Always join or detach
8. **Thread-safe != correct** - Still need to reason about behavior

## Best Practices

1. **Prefer higher-level abstractions** - std::async, parallel algorithms
2. **Minimize shared mutable state** - Message passing over shared memory
3. **Use atomics for simple counters** - Avoid mutexes when possible
4. **Use thread pools** - Avoid spawning many threads
5. **Profile before optimizing** - Concurrency has overhead
6. **Test with ThreadSanitizer** - Catch race conditions early
7. **Document thread safety** - Specify what is and isn't thread-safe
