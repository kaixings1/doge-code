# STL Deep Dive

Comprehensive guide to the C++ Standard Library, covering containers, algorithms, iterators, and customization points.

## Container Overview

| Container | Use When | Complexity |
|-----------|----------|------------|
| `vector` | Default choice, random access | O(1) append, O(1) random access |
| `deque` | Fast insert at both ends | O(1) insert front/back |
| `list` | Frequent insert/erase in middle | O(1) insert/erase |
| `forward_list` | Singly-linked, memory constrained | O(1) insert/erase |
| `array` | Fixed size, stack allocated | O(1) all operations |
| `string` | Text processing | O(1) append |
| `set`/`multiset` | Ordered unique elements | O(log n) lookup |
| `map`/`multimap` | Key-value, ordered | O(log n) lookup |
| `unordered_set`/`unordered_map` | Fast lookup, no ordering | O(1) average |

## Vector Internals

```cpp
#include <vector>

// Growth factor typically 1.5 or 2
std::vector<int> v;
v.reserve(100);  // Pre-allocate to avoid reallocation

// Emplace vs Insert
std::vector<std::pair<int, std::string>> vec;

// Emplace - constructs in place
vec.emplace_back(1, "one");  // No copy/move

// Insert - copies or moves
vec.insert(vec.end(), {2, "two"});

// Data contiguity enables:
int* arr = v.data();  // Raw pointer access
memcpy(&arr[0], source, v.size() * sizeof(int));  // Fast bulk copy
```

## Deque

```cpp
#include <deque>

// Blocks of arrays, O(1) push_front/push_back
std::deque<int> dq;
dq.push_front(1);  // Unlike vector
dq.push_back(2);

// Random access still O(1)
int x = dq[5];

// Used for queue, priority_queue default
```

## List and Forward List

```cpp
#include <list>

std::list<int> lst = {1, 2, 3, 4, 5};

// Splice - move elements between lists O(1)
std::list<int> lst2;
lst2.splice(lst2.begin(), lst, lst.begin(), ++lst.begin());  // Move one element

// Remove elements
lst.remove(3);  // Remove all 3s
lst.remove_if([](int x) { return x % 2 == 0; });

// Sort (list has own sort O(n log n))
lst.sort();

// Merge sorted lists
lst.merge(lst2);  // O(n)
```

## Associative Containers

### Set/Map

```cpp
#include <set>
#include <map>

std::set<int> s = {5, 2, 8, 1, 9};
s.insert(3);
s.erase(2);

// Find
auto it = s.find(5);
if (it != s.end()) { /* found */ }

// Lower/upper bound
auto range = s.equal_range(5);  // pair of iterators

// Custom comparator
std::set<int, std::greater<int>> desc;  // Descending order

// Map
std::map<std::string, int> m;
m["key"] = 42;  // Inserts if not exists
auto [it, inserted] = m.insert({"key", 42});  // C++17
m.emplace("key", 42);

// Insert or update
m.insert_or_assign("key", 100);  // C++17
m.try_emplace("key", 100);  // Only if key not exists
```

### Unordered Containers

```cpp
#include <unordered_set>
#include <unordered_map>

std::unordered_map<std::string, int> um;
um.reserve(1000);  // Pre-hash buckets
um.max_load_factor(0.7);  // Rebalance threshold

// Custom hash
struct MyHash {
    size_t operator()(const MyType& t) const {
        return hash_combine(t.field1, t.field2);
    }
};

std::unordered_map<MyType, Value, MyHash> custom;

// Bucket interface
size_t bucket_count = um.bucket_count();
for (size_t i = 0; i < bucket_count; ++i) {
    for (auto& element : um.bucket(i)) {
        // Process element in bucket i
    }
}
```

## Container Adaptors

```cpp
#include <stack>
#include <queue>
#include <priority_queue>

// Stack - LIFO
std::stack<int> s;
s.push(1);
s.top();  // Peek
s.pop();  // No return

// Queue - FIFO
std::queue<int> q;

// Priority queue - heap
std::priority_queue<int> pq;  // Max heap
std::priority_queue<int, std::vector<int>, std::greater<int>> min_pq;

// Custom comparator
struct Node {
    int priority;
    std::string data;
};
struct NodeCmp {
    bool operator()(const Node& a, const Node& b) const {
        return a.priority < b.priority;  // Higher priority first
    }
};
std::priority_queue<Node, std::vector<Node>, NodeCmp> task_queue;
```

## Algorithms

### Common Algorithms

```cpp
#include <algorithm>
#include <numeric>

std::vector<int> v = {5, 2, 8, 1, 9, 3};

// Non-modifying
std::for_each(v.begin(), v.end(), [](int x) { std::cout << x << ' '; });
std::count(v.begin(), v.end(), 5);
std::count_if(v.begin(), v.end(), [](int x) { return x > 5; });
auto it = std::find(v.begin(), v.end(), 5);
auto it = std::find_if(v.begin(), v.end(), [](int x) { return x > 5; });

// Modifying
std::fill(v.begin(), v.end(), 0);
std::transform(v.begin(), v.end(), v.begin(), [](int x) { return x * 2; });
std::copy(v.begin(), v.end(), dest.begin());
std::remove_if(v.begin(), v.end(), [](int x) { return x < 5; });
v.erase(std::remove_if(v.begin(), v.end(), pred), v.end());  // Erase-remove

// Sorting
std::sort(v.begin(), v.end());
std::stable_sort(v.begin(), v.end());  // Preserve equal elements order
std::partial_sort(v.begin(), v.begin() + 5, v.end());  // Top 5
std::nth_element(v.begin(), v.begin() + 5, v.end());  // Find median
std::inplace_merge(first, middle, last);

// Binary search (on sorted)
bool found = std::binary_search(v.begin(), v.end(), 5);
auto range = std::equal_range(v.begin(), v.end(), 5);

// Set operations
std::set_union(a.begin(), a.end(), b.begin(), b.end(), out.begin());
std::set_intersection(a.begin(), a.end(), b.begin(), b.end(), out.begin());
std::set_difference(a.begin(), a.end(), b.begin(), b.end(), out.begin());

// Heap operations
std::make_heap(v.begin(), v.end());
std::push_heap(v.begin(), v.end());
std::pop_heap(v.begin(), v.end());
v.pop_back();  // Remove largest

// Numeric
int sum = std::accumulate(v.begin(), v.end(), 0);
int product = std::accumulate(v.begin(), v.end(), 1, std::multiplies<int>());
std::inner_product(v1.begin(), v1.end(), v2.begin(), 0);
std::partial_sum(v.begin(), v.end(), output.begin());
std::adjacent_difference(v.begin(), v.end(), output.begin());
```

### Constrained Algorithms (C++20)

```cpp
#include <ranges>
#include <algorithm>

std::vector<int> v = {1, 2, 3, 4, 5};

// Ranges views
auto filtered = v | std::views::filter([](int x) { return x % 2 == 0; })
                  | std::views::transform([](int x) { return x * 2; });

// Constrained algorithms (C++20)
std::ranges::sort(v);
std::ranges::find(v, 5);
std::ranges::copy_if(v, output, [](int x) { return x > 0; });

// Projections
struct Person { std::string name; int age; };
std::vector<Person> people = {{"Alice", 30}, {"Bob", 25}};
std::ranges::sort(people, {}, &Person::age);  // Sort by age
```

## Iterators

### Iterator Categories

```cpp
#include <iterator>

// Input iterator - read once, forward
std::istream_iterator<int> it(std::cin);
int val = *it++;

// Output iterator - write once, forward
std::ostream_iterator<int> out(std::cout, " ");
*out++ = 42;

// Forward iterator - multiple reads/writes
std::forward_list<int>::iterator

// Bidirectional iterator - forward + backward
std::list<int>::iterator

// Random access iterator - O(1) arithmetic
std::vector<int>::iterator

// Contiguous iterator (C++17) - contiguous memory
std::vector<int>::iterator  // Since C++17
```

### Custom Iterator

```cpp
template<typename Container>
class Iterator {
    using iterator_category = std::random_access_iterator_tag;
    using value_type = typename Container::value_type;
    using difference_type = typename Container::difference_type;
    using pointer = typename Container::pointer;
    using reference = typename Container::reference;
    
    Container* container_;
    difference_type index_;
    
public:
    reference operator*() const { return (*container_)[index_]; }
    pointer operator->() const { return &(*container_)[index_]; }
    
    Iterator& operator++() { ++index_; return *this; }
    Iterator operator++(int) { auto tmp = *this; ++index_; return tmp; }
    
    difference_type operator-(const Iterator& other) const {
        return index_ - other.index_;
    }
};
```

### Iterator Adapters

```cpp
#include <iterator>

// Reverse iterator
std::vector<int> v = {1, 2, 3, 4, 5};
for (auto it = v.rbegin(); it != v.rend(); ++it) {
    std::cout << *it << ' ';  // 5 4 3 2 1
}

// Move iterator
std::vector<std::unique_ptr<int>> sources;
std::vector<std::unique_ptr<int>> dests;
std::move(sources.begin(), sources.end(), std::back_inserter(dests));

// Back insert iterator
std::vector<int> result;
std::fill_n(std::back_inserter(result), 10, 42);

// Counted iterator (C++20)
auto it = std::counted_iterator(v.begin(), 5);  // First 5 elements

// Common iterator (C++23)
std::common_iterator<std::istream_iterator<int>, std::ostream_iterator<int>> it;
```

## Allocators

### Custom Allocator

```cpp
template<typename T>
class PoolAllocator {
    static constexpr size_t block_size = 1024;
    std::vector<std::array<T, block_size>> pools_;
    std::vector<T*> free_list_;
    
public:
    using value_type = T;
    
    T* allocate(size_t n) {
        if (n > block_size) throw std::bad_alloc();
        
        if (free_list_.empty()) {
            pools_.push_back({});
            for (auto& block : pools_.back()) {
                free_list_.push_back(&block);
            }
        }
        
        T* ptr = free_list_.back();
        free_list_.pop_back();
        return ptr;
    }
    
    void deallocate(T* ptr, size_t n) {
        free_list_.push_back(ptr);
    }
};

// Usage
std::vector<int, PoolAllocator<int>> v;
```

### pmr (Polymorphic Memory Resource)

```cpp
#include <memory_resource>

// Synchronized pool
std::pmr::synchronized_pool_resource pool;

// Memory pool
std::pmr::vector<int> v{&pool};
v.push_back(1);

// New/delete resource
std::pmr::new_delete_resource();

// Vector with different resources
std::pmr::vector<int> v1;  // Uses default_resource
std::pmr::vector<int> v2{&pool};
```

## Views (C++20)

```cpp
#include <ranges>
#include <vector>

std::vector<int> v = {1, 2, 3, 4, 5, 6, 7, 8, 9, 10};

// Transform
auto doubled = v | std::views::transform([](int x) { return x * 2; });

// Filter
auto evens = v | std::views::filter([](int x) { return x % 2 == 0; });

// Take/Drop
auto first5 = v | std::views::take(5);
auto skip5 = v | std::views::drop(5);

// Reverse
auto rev = v | std::views::reverse;

// Split/Join
std::string text = "hello,world";
auto words = text | std::views::split(',');

// All views are lazy - no copying
for (int x : v | std::views::filter(even) | std::views::transform(square)) {
    // ...
}
```

## String

```cpp
#include <string>
#include <string_view>

// String_view (C++17) - non-owning
std::string_view sv = "hello world";
std::string_view sub = sv.substr(0, 5);  // "hello"

// Important: don't let string_view outlive the source
std::string s = "original";
std::string_view sv = s;
s = "modified";  // sv now points to invalid memory!

// String operations
std::string s = "Hello World";
s.replace(0, 5, "Goodbye");  // "Goodbye World"
s.erase(0, 8);  // "World"
s.find("or");  // position
s.find_first_of("aeiou");
s.find_last_not_of(" ");

// StringBuilder (use string with reserve)
std::string build;
build.reserve(100);
for (int i = 0; i < 10; ++i) {
    build += std::to_string(i);
}
```

## Best Practices

1. **Prefer vector** - Almost always the right choice
2. **Reserve when possible** - Avoid reallocations
3. **Use emplace** - Construct in-place
4. **Use views for chains** - Lazy evaluation, no copies
5. **Choose right container** - Match access patterns
6. **Avoid raw loops** - Use algorithms
7. **Use string_view** - Avoid unnecessary copies

## Resources

- [cppreference Containers](https://en.cppreference.com/w/cpp/container)
- [cppreference Algorithms](https://en.cppreference.com/w/cpp/algorithm)
- [C++20 Ranges](https://en.cppreference.com/w/cpp/ranges)
