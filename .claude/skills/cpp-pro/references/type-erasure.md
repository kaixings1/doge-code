# Type Erasure

Comprehensive guide to type erasure in modern C++, covering `std::function`, `std::any`, and custom type erasure patterns.

## What is Type Erasure?

Type erasure removes type information at compile time while preserving it at runtime. It's used to:
- Store different types in a homogeneous container
- Decouple interfaces from implementations
- Create type-erased wrappers for any type

## std::function

```cpp
#include <functional>
#include <vector>

// Type-erased callable
std::function<int(int, int)> func;

// Can store any callable with matching signature
func = [](int a, int b) { return a + b; };
func = std::plus<int>{};
func = std::bind([](int a, int b, int c) { return a + b + c; }, 
                 std::placeholders::_1, std::placeholders::_2, 10);

// Use
int result = func(1, 2);  // Calls the stored callable

// Store in container
std::vector<std::function<void()>> callbacks;

callbacks.push_back([]() { std::cout << "A\n"; });
callbacks.push_back([]() { std::cout << "B\n"; });

for (auto& cb : callbacks) {
    cb();  // Calls each stored function
}

// Member functions
struct Widget {
    void process() { std::cout << "Processing\n"; }
};

Widget w;
std::function<void()> member_func = std::bind(&Widget::process, &w);
std::function<void()> member_func2 = [&w]() { w.process(); };

// With arguments
std::function<void(int)> on_click = [](int x) { std::cout << "Clicked " << x << "\n"; };
```

## std::any

```cpp
#include <any>
#include <string>

// Type-erased container for any type
std::any value;

// Store
value = 42;
value = std::string("hello");
value = std::vector<int>{1, 2, 3};

// Retrieve
if (auto* p = std::any_cast<int>(&value)) {
    std::cout << *p << '\n';
}

// With exceptions
try {
    std::string s = std::any_cast<std::string>(value);
} catch (const std::bad_any_cast& e) {
    std::cerr << e.what() << '\n';
}

// Check type
if (value.type() == typeid(int)) {
    // It's an int
}
```

## Custom Type Erasure

### Basic Pattern

```cpp
#include <memory>
#include <string>
#include <iostream>

class AnyCallable {
    // Concept - the interface all types must implement
    struct Concept {
        virtual ~Concept() = default;
        virtual void call() = 0;
        virtual std::unique_ptr<Concept> clone() const = 0;
    };
    
    // Model - wraps any concrete type
    template<typename F>
    struct Model : Concept {
        F func_;
        
        Model(F f) : func_(std::move(f)) {}
        
        void call() override { func_(); }
        
        std::unique_ptr<Concept> clone() const override {
            return std::make_unique<Model>(func_);
        }
    };
    
    std::unique_ptr<Concept> concept_;
    
public:
    // Store any callable
    template<typename F>
    AnyCallable(F f) : concept_(std::make_unique<Model<F>>(std::move(f))) {}
    
    // Copy constructor
    AnyCallable(const AnyCallable& other) 
        : concept_(other.concept_->clone()) {}
    
    // Invoke
    void operator()() { concept_->call(); }
};
```

### With Return Values and Arguments

```cpp
template<typename Signature>
class Function;

template<typename R, typename... Args>
class Function<R(Args...)> {
    struct Concept {
        virtual ~Concept() = default;
        virtual R invoke(Args...) = 0;
        virtual std::unique_ptr<Concept> clone() const = 0;
    };
    
    template<typename F>
    struct Model : Concept {
        F func_;
        
        Model(F f) : func_(std::move(f)) {}
        
        R invoke(Args... args) override { 
            return func_(std::forward<Args>(args)...); 
        }
        
        std::unique_ptr<Concept> clone() const override {
            return std::make_unique<Model>(func_);
        }
    };
    
    std::unique_ptr<Concept> concept_;
    
public:
    Function() = default;
    
    template<typename F>
    Function(F f) : concept_(std::make_unique<Model<F>>(std::move(f))) {}
    
    R operator()(Args... args) const {
        return concept_->invoke(std::forward<Args>(args)...);
    }
    
    explicit operator bool() const { return concept_ != nullptr; }
};
```

### With Type Erasure for Containers

```cpp
#include <vector>
#include <memory>
#include <string>

// Type-erased vector
class AnyVector {
    struct Concept {
        virtual ~Concept() = default;
        virtual std::unique_ptr<Concept> clone() const = 0;
        virtual std::type_index type() const = 0;
        virtual void print(std::ostream&) const = 0;
    };
    
    template<typename T>
    struct Model : Concept {
        T value_;
        
        Model(T v) : value_(std::move(v)) {}
        
        std::unique_ptr<Concept> clone() const override {
            return std::make_unique<Model>(value_);
        }
        
        std::type_index type() const override {
            return std::type_index(typeid(T));
        }
        
        void print(std::ostream& os) const override {
            os << value_;
        }
    };
    
    std::unique_ptr<Concept> concept_;
    
public:
    template<typename T>
    AnyVector(T v) : concept_(std::make_unique<Model<T>>(std::move(v))) {}
    
    AnyVector(const AnyVector& other) : concept_(other.concept_->clone()) {}
    
    template<typename T>
    T* get() {
        if (concept_->type() == std::type_index(typeid(T))) {
            return &dynamic_cast<Model<T>&>(*concept_).value_;
        }
        return nullptr;
    }
    
    void print(std::ostream& os) const { concept_->print(os); }
};

std::vector<AnyVector> mixed = {
    42,
    3.14,
    std::string("hello")
};
```

## Erasure for Policy-Based Design

```cpp
#include <memory>
#include <vector>

// Type-erased policies
class Drawable {
    struct Concept {
        virtual ~Concept() = default;
        virtual void draw() const = 0;
        virtual std::unique_ptr<Concept> clone() const = 0;
    };
    
    template<typename T>
    struct Model : Concept {
        T object_;
        
        Model(T o) : object_(std::move(o)) {}
        
        void draw() const override { object_.draw(); }
        
        std::unique_ptr<Concept> clone() const override {
            return std::make_unique<Model>(object_);
        }
    };
    
    std::unique_ptr<Concept> object_;
    
public:
    template<typename T>
    Drawable(T t) : object_(std::make_unique<Model<T>>(std::move(t))) {}
    
    Drawable(const Drawable& other) : object_(other.object_->clone()) {}
    
    void draw() const { object_->draw(); }
};

// Concrete types
struct Circle { void draw() const { std::cout << "Circle\n"; } };
struct Square { void draw() const { std::cout << "Square\n"; } };

// Now can mix in container
std::vector<Drawable> shapes;
shapes.push_back(Circle{});
shapes.push_back(Square{});

for (const auto& s : shapes) {
    s.draw();  // Polymorphic call
}
```

## Type Erasure vs Virtual Functions

| Aspect | Type Erasure | Virtual Functions |
|--------|--------------|------------------|
| Performance | Similar (indirection) | Similar |
| Flexibility | Can add types after compilation | Requires base class |
| Interface | Defined by wrapper | Explicit base class |
| Use case | Heterogeneous containers | OOP hierarchies |

## Performance Considerations

```cpp
#include <functional>

// std::function has overhead:
// - Heap allocation for large closures
// - Virtual dispatch

// Small buffer optimization (SBO)
class SmallFunction {
    // Small buffer storage
    alignas(16) char buffer_[256];
    
    // Pointer to model for large types
    Concept* model_ = nullptr;
    
    // For small types, store directly in buffer
    template<typename F>
    bool fits() const { 
        return sizeof(F) <= sizeof(buffer_) && 
               std::is_trivially_destructible_v<F>;
    }
};
```

## AnyCallable with State

```cpp
#include <memory>
#include <functional>

template<typename Signature>
class StatefulFunction;

template<typename R, typename... Args>
class StatefulFunction<R(Args...)> {
    struct Concept {
        virtual ~Concept() = default;
        virtual R invoke(Args...) = 0;
        virtual std::unique_ptr<Concept> clone() const = 0;
    };
    
    template<typename F, typename S>
    struct Model : Concept {
        F func_;
        S state_;
        
        Model(F f, S s) : func_(std::move(f)), state_(std::move(s)) {}
        
        R invoke(Args... args) override { 
            return func_(state_, std::forward<Args>(args)...); 
        }
        
        std::unique_ptr<Concept> clone() const override {
            return std::make_unique<Model>(func_, state_);
        }
    };
    
    std::unique_ptr<Concept> model_;
    
public:
    template<typename F, typename S>
    StatefulFunction(F func, S state) 
        : model_(std::make_unique<Model<F, S>>(std::move(func), std::move(state))) {}
    
    R operator()(Args... args) const {
        return model_->invoke(std::forward<Args>(args)...);
    }
};

// Usage
auto counter = StatefulFunction<int(int)>(
    [](int& state, int increment) { return state += increment; },
    0  // Initial state
);

counter(1);  // Returns 1
counter(5);  // Returns 6
```

## Best Practices

1. **Use std::function** - For callable type erasure
2. **Use std::any** - For any-type containers
3. **Custom erasure** - For specialized interfaces
4. **Consider SBO** - Small buffer optimization for performance
5. **Clone support** - For value semantics
6. **Move support** - For efficiency

## Resources

- [Type Erasure - Jon Kalb](https://www.youtube.com/watch?v=QzJqXK4GFwA)
- [C++ Seasoning - Sean Parent](https://www.youtube.com/watch?v=W2tWOdzA0O4)
- [cppreference: std::function](https://en.cppreference.com/w/cpp/utility/functional/function)
