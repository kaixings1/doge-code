# Memory Allocation Patterns

Comprehensive guide to memory allocation strategies, patterns, and algorithms in C++.

## Allocation Strategies Overview

| Strategy | Allocation | Deallocation | Best For |
|----------|------------|--------------|----------|
| **Heap (default)** | Slow | Slow | General purpose |
| **Stack** | Instant | Instant | Temporary, small |
| **Pool** | Fast | Fast | Fixed-size objects |
| **Arena** | Fast | Fast (bulk) | Many allocations |
| **Slab** | Fast | Fast | Object caches |
| **Bump Pointer** | Instant | Bulk only | Single-phase |
| **Free List** | Medium | Medium | Variable size |
| **Buddy** | Medium | Medium | Power-of-2 sizes |

## Stack Allocation

### Stack Memory

```cpp
// Automatic storage duration
void function() {
    int local;           // Stack
    int array[100];      // Stack
    std::vector<int> v; // Stack pointer, heap data
    
    // All deallocated on return
}

// Alloca-like (non-standard, GCC/Clang)
#include <alloca.h>

void process(size_t n) {
    int* data = static_cast<int*>(alloca(n * sizeof(int)));
    // Used like regular pointer
    // Automatically freed
}
```

### Placement New

```cpp
#include <new>

alignas(16) char buffer[256];

void* operator new(size_t size, void* ptr) noexcept {
    return ptr;
}

void use_buffer() {
    Widget* w = new (buffer) Widget();
    w->~Widget();  // Explicit destructor call
}
```

## Object Pools

### Fixed-Size Pool

```cpp
#include <vector>
#include <memory>

template<typename T>
class ObjectPool {
    struct Block {
        alignas(T) unsigned char data[sizeof(T)];
        bool in_use = false;
    };
    
    std::vector<Block> blocks_;
    std::vector<T*> free_list_;
    
public:
    ObjectPool(size_t capacity) : blocks_(capacity) {
        for (auto& block : blocks_) {
            free_list_.push_back(reinterpret_cast<T*>(block.data));
        }
    }
    
    template<typename... Args>
    T* allocate(Args&&... args) {
        if (free_list_.empty()) {
            return nullptr;  // Or expand
        }
        
        T* ptr = free_list_.back();
        free_list_.pop_back();
        blocks_[ptr - reinterpret_cast<T*>(blocks_.data())].in_use = true;
        
        return new (ptr) T(std::forward<Args>(args)...);
    }
    
    void deallocate(T* ptr) {
        ptr->~T();
        size_t index = ptr - reinterpret_cast<T*>(blocks_.data());
        blocks_[index].in_use = false;
        free_list_.push_back(ptr);
    }
};
```

### TLSF (Two-Level Segregate Fit)

```cpp
// TLSF - Real-time allocator
// See: http://www.gii.upv.es/tlsf/

// Available as library: tlsf
#include <tlsf/tlsf.h>

tlsf_t pool = tlsf_create_with_pool(area, size);
void* p = tlsf_malloc(pool, size);
tlsf_free(pool, p);
tlsf_destroy(pool);
```

## Arena Allocator

```cpp
#include <cstdlib>
#include <cstring>

class Arena {
    char* buffer_ = nullptr;
    size_t capacity_ = 0;
    size_t offset_ = 0;
    
public:
    Arena(size_t size) : capacity_(size) {
        buffer_ = static_cast<char*>(std::aligned_alloc(16, size));
    }
    
    ~Arena() { std::free(buffer_); }
    
    void* allocate(size_t size, size_t align = 16) {
        // Align offset
        size_t align_offset = (align - (offset_ % align)) % align;
        if (offset_ + align_offset + size > capacity_) {
            return nullptr;
        }
        
        offset_ += align_offset;
        void* ptr = buffer_ + offset_;
        offset_ += size;
        return ptr;
    }
    
    template<typename T, typename... Args>
    T* create(Args&&... args) {
        void* ptr = allocate(sizeof(T), alignof(T));
        return new (ptr) T(std::forward<Args>(args)...);
    }
    
    void reset() { offset_ = 0; }  // Bulk deallocation
    
    size_t used() const { return offset_; }
    size_t capacity() const { return capacity_; }
    
private:
    Arena(const Arena&) = delete;
    Arena& operator=(const Arena&) = delete;
};

// Usage
void process() {
    Arena arena(1024 * 1024);  // 1MB
    
    auto data = arena.create<Data>(args...);
    auto buffer = arena.allocate(4096, 64);
    
    arena.reset();  // All freed at once
}
```

## Slab Allocation

```cpp
class SlabAllocator {
    struct Slab {
        static constexpr size_t SIZE = 4096;
        alignas(64) char data[SIZE];
        size_t offset = 0;
        Slab* next = nullptr;
    };
    
    Slab* current_slab_ = nullptr;
    size_t object_size_ = 0;
    size_t objects_per_slab_ = 0;
    
public:
    explicit SlabAllocator(size_t obj_size) : object_size_(obj_size) {
        objects_per_slab_ = Slab::SIZE / obj_size;
        allocate_slab();
    }
    
    void* allocate() {
        if (current_slab_->offset >= objects_per_slab_) {
            allocate_slab();
        }
        
        void* ptr = current_slab_->data + 
                    current_slab_->offset * object_size_;
        current_slab_->offset++;
        return ptr;
    }
    
    void deallocate(void* ptr) {
        // Can't really free individual objects
        // Just mark as free if tracking
    }
    
private:
    void allocate_slab() {
        current_slab_ = new Slab();
    }
};
```

## Free List

### Explicit Free List

```cpp
class FreeListAllocator {
    struct Header {
        size_t size;
        Header* next;
    };
    
    Header* free_list_ = nullptr;
    size_t total_size_ = 0;
    
public:
    void* allocate(size_t size) {
        // Round up to alignment
        size = (size + alignof(Header) - 1) & ~(alignof(Header) - 1);
        
        if (free_list_) {
            // Find best fit
            Header** prev = &free_list_;
            Header* best = nullptr;
            Header** best_prev = nullptr;
            
            for (Header* curr = free_list_; curr; prev = &curr->next, curr = curr->next) {
                if (curr->size >= size && (!best || curr->size < best->size)) {
                    best = curr;
                    best_prev = prev;
                }
            }
            
            if (best) {
                *best_prev = best->next;
                return best + 1;
            }
        }
        
        // Allocate from system
        size_t alloc_size = sizeof(Header) + size;
        Header* mem = static_cast<Header*>(std::malloc(alloc_size));
        mem->size = size;
        total_size_ += alloc_size;
        return mem + 1;
    }
    
    void deallocate(void* ptr) {
        Header* header = static_cast<Header*>(ptr) - 1;
        header->next = free_list_;
        free_list_ = header;
    }
};
```

## Buddy System

```cpp
// Power-of-2 allocator with fast splitting/coalescing
class BuddyAllocator {
    static constexpr size_t MIN_ORDER = 3;  // 8 bytes
    static constexpr size_t MAX_ORDER = 20;  // 1MB
    
    struct Block {
        bool allocated = false;
        size_t order;
    };
    
    std::vector<Block> free_lists_[MAX_ORDER - MIN_ORDER + 1];
    
public:
    void* allocate(size_t size) {
        // Find required order
        size_t order = MIN_ORDER;
        while ((1 << order) < size && order < MAX_ORDER) order++;
        
        // Find free block
        for (size_t o = order; o <= MAX_ORDER; o++) {
            if (!free_lists_[o - MIN_ORDER].empty()) {
                // Split blocks down to required order
                while (o > order) {
                    // Split: allocate two blocks of order-1
                    o--;
                }
                return /* pointer to block */;
            }
        }
        
        return nullptr;  // Out of memory
    }
    
    void deallocate(void* ptr, size_t order) {
        // Coalesce with buddy if free
    }
};
```

## Thread-Local Allocation

```cpp
#include <thread>

// Per-thread heap
class ThreadLocalHeap {
    static thread_local std::vector<char> tls_heap;
    static thread_local size_t tls_offset;
    
public:
    static void* allocate(size_t size) {
        // Align
        size = (size + 7) & ~7;
        
        if (tls_offset + size > tls_heap.size()) {
            tls_heap.resize(tls_heap.size() * 2);
        }
        
        void* ptr = tls_heap.data() + tls_offset;
        tls_offset += size;
        return ptr;
    }
    
    static void reset() {
        tls_offset = 0;
    }
};
```

## Malloc Variants

```cpp
#include <cstdlib>

// Aligned allocation
void* aligned = std::aligned_alloc(64, 4096);  // C17
void* posix_aligned = posix_memalign(&ptr, 64, 4096);  // POSIX
void* msvc_aligned = _aligned_malloc(4096, 64);  // Windows

// jemalloc - Multi-threaded
#include <jemalloc/jemalloc.h>
void* p = je_malloc(1024);

// tcmalloc - Google's malloc
#include <gperftools/tcmalloc.h>
void* p = tc_malloc(1024);

// mimalloc - Microsoft Research
#include <mimalloc.h>
void* p = mi_malloc(1024);
```

## Custom Allocator Interface

```cpp
#include <memory>

template<typename T>
class CustomAllocator {
public:
    using value_type = T;
    
    CustomAllocator() = default;
    template<typename U> CustomAllocator(const CustomAllocator<U>&) {}
    
    T* allocate(size_t n) {
        if (n > std::numeric_limits<size_t>::max() / sizeof(T)) {
            throw std::bad_alloc();
        }
        T* p = static_cast<T*>(::operator new(n * sizeof(T)));
        return p;
    }
    
    void deallocate(T* p, size_t) {
        ::operator delete(p);
    }
    
    template<typename U>
    bool operator==(const CustomAllocator<U>&) const { return true; }
};

// Usage
std::vector<int, CustomAllocator<int>> vec;
std::map<int, std::string, std::less<int>, 
         CustomAllocator<std::pair<const int, std::string>>> map;
```

## Arena with Multiple Threads

```cpp
#include <atomic>

class LockFreeArena {
    std::atomic<size_t> offset_{0};
    char* buffer_;
    const size_t capacity_;
    
public:
    LockFreeArena(size_t size) : capacity_(size) {
        buffer_ = static_cast<char*>(std::aligned_alloc(16, size));
    }
    
    void* allocate(size_t size) {
        size_t desired = (size + 15) & ~15;  // 16-byte align
        
        size_t offset = offset_.fetch_add(desired, std::memory_order_relaxed);
        if (offset + desired > capacity_) {
            return nullptr;
        }
        
        return buffer_ + offset;
    }
    
    ~LockFreeArena() { std::free(buffer_); }
};
```

## Performance Comparison

| Operation | malloc/free | Pool | Arena | TLSF |
|-----------|------------|------|-------|------|
| Allocate | ~100ns | ~5ns | ~1ns | ~20ns |
| Deallocate | ~50ns | ~1ns | - | ~20ns |
| Fragmentation | High | Low | None | Medium |
| Memory overhead | ~8% | ~1% | 0% | ~5% |

## Best Practices

1. **Profile first** - Don't optimize without data
2. **Use pools** - For fixed-size allocations
3. **Use arenas** - For related lifetimes
4. **Thread-local** - Reduce contention
5. **Align data** - For SIMD, cache lines

## Resources

- [jemalloc](https://jemalloc.net/)
- [tcmalloc](https://github.com/gperftools/gperftools)
- [mimalloc](https://github.com/microsoft/mimalloc)
- [TLSF Paper](http://www.gii.upv.es/tlsf/)
