# Modern C++ Design Patterns

Comprehensive guide to design patterns implemented in modern C++ (C++11-23).

## Creational Patterns

### Singleton

```cpp
class Singleton {
public:
    static Singleton& get_instance() {
        static Singleton instance;  // Thread-safe in C++11+
        return instance;
    }
    
    // Delete copy/move
    Singleton(const Singleton&) = delete;
    Singleton& operator=(const Singleton&) = delete;
    
    void do_something() {}
    
private:
    Singleton() = default;  // Private constructor
};

Singleton& s = Singleton::get_instance();
```

### Factory Method

```cpp
#include <memory>
#include <map>

class Product {
public:
    virtual ~Product() = default;
    virtual void operation() = 0;
};

class ConcreteProductA : public Product {
public:
    void operation() override { std::cout << "Product A\n"; }
};

class ConcreteProductB : public Product {
public:
    void operation() override { std::cout << "Product B\n"; }
};

class Factory {
public:
    void register_product(const std::string& name, 
                         std::function<std::unique_ptr<Product>()> creator) {
        creators_[name] = std::move(creator);
    }
    
    std::unique_ptr<Product> create(const std::string& name) {
        return creators_[name]();
    }
    
private:
    std::map<std::string, std::function<std::unique_ptr<Product>()>> creators_;
};

// Usage
Factory factory;
factory.register_product("A", []{ return std::make_unique<ConcreteProductA>(); });
factory.register_product("B", []{ return std::make_unique<ConcreteProductB>(); });

auto product = factory.create("A");
```

### Builder

```cpp
#include <string>
#include <memory>

class Person {
public:
    std::string name;
    std::string address;
    int age = 0;
    
    class Builder;
    std::unique_ptr<Builder> clone_builder() const;
};

class Person::Builder {
    std::unique_ptr<Person> person_ = std::make_unique<Person>();
    
public:
    Builder& name(const std::string& n) { 
        person_->name = n; 
        return *this; 
    }
    
    Builder& address(const std::string& a) { 
        person_->address = a; 
        return *this; 
    }
    
    Builder& age(int a) { 
        person_->age = a; 
        return *this; 
    }
    
    std::unique_ptr<Person> build() { 
        return std::move(person_); 
    }
    
    // For copying builder from existing person
    void load_from(const Person& p) {
        person_->name = p.name;
        person_->address = p.address;
        person_->age = p.age;
    }
};

// Fluent interface
auto person = Person::Builder{}
    .name("John")
    .address("NYC")
    .age(30)
    .build();
```

### Prototype

```cpp
#include <memory>

class Prototype {
public:
    virtual ~Prototype() = default;
    virtual std::unique_ptr<Prototype> clone() const = 0;
    virtual void do_something() = 0;
};

class ConcretePrototype : public Prototype {
public:
    ConcretePrototype(int value) : value_(value) {}
    
    std::unique_ptr<Prototype> clone() const override {
        return std::make_unique<ConcretePrototype>(*this);  // Copy
    }
    
    void do_something() override { std::cout << value_ << '\n'; }
    
private:
    int value_;
};

// Prototype registry
class PrototypeRegistry {
    std::map<std::string, std::unique_ptr<Prototype>> prototypes_;
    
public:
    void add(const std::string& name, std::unique_ptr<Prototype> proto) {
        prototypes_[name] = std::move(proto);
    }
    
    std::unique_ptr<Prototype> create(const std::string& name) {
        return prototypes_[name]->clone();
    }
};
```

## Structural Patterns

### Adapter

```cpp
// Old interface
class OldInterface {
public:
    virtual ~OldInterface() = default;
    virtual void legacy_operation(const std::string&) = 0;
};

// New interface we want to use
class NewInterface {
public:
    virtual ~NewInterface() = default;
    virtual void modern_operation(int, double) = 0;
};

// Adapter
class Adapter : public NewInterface {
    std::unique_ptr<OldInterface> adaptee_;
    
public:
    Adapter(std::unique_ptr<OldInterface> adaptee)
        : adaptee_(std::move(adaptee)) {}
    
    void modern_operation(int i, double d) override {
        std::string legacy_input = std::to_string(i) + ":" + std::to_string(d);
        adaptee_->legacy_operation(legacy_input);
    }
};
```

### Bridge

```cpp
// Implementation (platform-specific)
class Renderer {
public:
    virtual ~Renderer() = default;
    virtual void draw_circle(float x, float y, float radius) = 0;
};

class OpenGLRenderer : public Renderer {
public:
    void draw_circle(float x, float y, float radius) override;
};

class DirectXRenderer : public Renderer {
public:
    void draw_circle(float x, float y, float radius) override;
};

// Abstraction
class Shape {
protected:
    std::unique_ptr<Renderer> renderer_;
    
public:
    Shape(std::unique_ptr<Renderer> r) : renderer_(std::move(r)) {}
    virtual ~Shape() = default;
    virtual void draw() = 0;
    virtual void resize(float factor) = 0;
};

class Circle : public Shape {
    float x_, y_, radius_;
    
public:
    Circle(std::unique_ptr<Renderer> r, float x, float y, float radius)
        : Shape(std::move(r)), x_(x), y_(y), radius_(radius) {}
    
    void draw() override {
        renderer_->draw_circle(x_, y_, radius_);
    }
    
    void resize(float factor) override {
        radius_ *= factor;
    }
};
```

### Composite

```cpp
#include <vector>
#include <memory>

class Component {
public:
    virtual ~Component() = default;
    virtual void operation() = 0;
    virtual void add(std::shared_ptr<Component>) {}
    virtual void remove(const std::shared_ptr<Component>&) {}
    virtual std::shared_ptr<Component> get_child(size_t) const { return nullptr; }
};

class Leaf : public Component {
    std::string name_;
public:
    explicit Leaf(const std::string& n) : name_(n) {}
    void operation() override { std::cout << "Leaf " << name_ << '\n'; }
};

class Composite : public Component {
    std::vector<std::shared_ptr<Component>> children_;
    std::string name_;
    
public:
    explicit Composite(const std::string& n) : name_(n) {}
    
    void operation() override {
        std::cout << "Composite " << name_ << ":\n";
        for (auto& child : children_) {
            child->operation();
        }
    }
    
    void add(std::shared_ptr<Component> c) override {
        children_.push_back(std::move(c));
    }
    
    void remove(const std::shared_ptr<Component>& c) override {
        children_.erase(
            std::remove(children_.begin(), children_.end(), c),
            children_.end()
        );
    }
    
    std::shared_ptr<Component> get_child(size_t i) const override {
        return children_.at(i);
    }
};
```

### Decorator

```cpp
#include <memory>

class Component {
public:
    virtual ~Component() = default;
    virtual std::string operation() const = 0;
};

class ConcreteComponent : public Component {
public:
    std::string operation() const override { return "ConcreteComponent"; }
};

class Decorator : public Component {
protected:
    std::shared_ptr<Component> component_;
    
public:
    explicit Decorator(std::shared_ptr<Component> c) : component_(c) {}
};

class ConcreteDecoratorA : public Decorator {
    std::string added_state_;
    
public:
    using Decorator::Decorator;
    
    std::string operation() const override {
        return "ConcreteDecoratorA(" + component_->operation() + ")";
    }
};

class ConcreteDecoratorB : public Decorator {
public:
    using Decorator::Decorator;
    
    std::string operation() const override {
        return component_->operation() + "+AddedBehavior";
    }
};

// Usage
auto component = std::make_shared<ConcreteComponent>();
auto decorated = std::make_shared<ConcreteDecoratorA>(component);
auto fully_decorated = std::make_shared<ConcreteDecoratorB>(decorated);
```

### Facade

```cpp
#include <memory>

// Complex subsystem classes
class SubsystemA {
public:
    void operation_a() { std::cout << "A"; }
};

class SubsystemB {
public:
    void operation_b() { std::cout << "B"; }
};

class SubsystemC {
public:
    void operation_c() { std::cout << "C"; }
};

// Facade
class Facade {
    std::unique_ptr<SubsystemA> a_ = std::make_unique<SubsystemA>();
    std::unique_ptr<SubsystemB> b_ = std::make_unique<SubsystemB>();
    std::unique_ptr<SubsystemC> c_ = std::make_unique<SubsystemC>();
    
public:
    void simple_operation() {
        a_->operation_a();
        b_->operation_b();
        c_->operation_c();
    }
};
```

### Proxy

```cpp
#include <memory>

class Subject {
public:
    virtual ~Subject() = default;
    virtual void request() = 0;
};

class RealSubject : public Subject {
public:
    void request() override { 
        std::cout << "RealSubject: Handling request.\n"; 
    }
};

class Proxy : public Subject {
    std::unique_ptr<RealSubject> real_subject_;
    bool check_access() const { /* ... */ return true; }
    void log_access() const { /* ... */ }
    
public:
    void request() override {
        if (check_access()) {
            if (!real_subject_) {
                real_subject_ = std::make_unique<RealSubject>();
            }
            log_access();
            real_subject_->request();
        }
    }
};
```

## Behavioral Patterns

### Observer

```cpp
#include <vector>
#include <memory>

class Observer {
public:
    virtual ~Observer() = default;
    virtual void update(const std::string& message) = 0;
};

class Subject {
    std::vector<std::weak_ptr<Observer>> observers_;
    
public:
    void attach(std::shared_ptr<Observer> obs) {
        observers_.push_back(obs);
    }
    
    void detach(std::shared_ptr<Observer> obs) {
        observers_.erase(
            std::remove_if(observers_.begin(), observers_.end(),
                [&obs](const auto& w) { return w.lock() == obs; }),
            observers_.end()
        );
    }
    
    void notify(const std::string& message) {
        // Clean expired observers
        observers_.erase(
            std::remove_if(observers_.begin(), observers_.end(),
                [](const auto& w) { return w.expired(); }),
            observers_.end()
        );
        
        for (auto& obs : observers_) {
            if (auto o = obs.lock()) {
                o->update(message);
            }
        }
    }
};
```

### Strategy

```cpp
#include <memory>
#include <functional>

class Strategy {
public:
    virtual ~Strategy() = default;
    virtual int execute(const std::vector<int>& data) const = 0;
};

class Context {
    std::unique_ptr<Strategy> strategy_;
    
public:
    void set_strategy(std::unique_ptr<Strategy> s) {
        strategy_ = std::move(s);
    }
    
    int execute_strategy(const std::vector<int>& data) const {
        return strategy_->execute(data);
    }
};

// Concrete strategies
class SortAscending : public Strategy {
public:
    int execute(const std::vector<int>& data) const override {
        auto sorted = data;
        std::sort(sorted.begin(), sorted.end());
        return sorted.back();
    }
};

class SumStrategy : public Strategy {
public:
    int execute(const std::vector<int>& data) const override {
        return std::accumulate(data.begin(), data.end(), 0);
    }
};

// With std::function
class ModernContext {
    std::function<int(const std::vector<int>&)> strategy_;
    
public:
    void set_strategy(std::function<int(const std::vector<int>&)> s) {
        strategy_ = std::move(s);
    }
    
    int execute(const std::vector<int>& data) const {
        return strategy_(data);
    }
};
```

### Command

```cpp
#include <memory>
#include <stack>

class Command {
public:
    virtual ~Command() = default;
    virtual void execute() = 0;
    virtual void undo() = 0;
};

class Receiver {
public:
    void action() { std::cout << "Action performed\n"; }
    void reverse_action() { std::cout << "Action undone\n"; }
};

class ConcreteCommand : public Command {
    std::shared_ptr<Receiver> receiver_;
    
public:
    explicit ConcreteCommand(std::shared_ptr<Receiver> r) 
        : receiver_(r) {}
    
    void execute() override { receiver_->action(); }
    void undo() override { receiver_->reverse_action(); }
};

class Invoker {
    std::stack<std::unique_ptr<Command>> history_;
    
public:
    void execute(std::unique_ptr<Command> cmd) {
        cmd->execute();
        history_.push(std::move(cmd));
    }
    
    void undo() {
        if (!history_.empty()) {
            history_.top()->undo();
            history_.pop();
        }
    }
};
```

### Iterator

```cpp
#include <vector>
#include <memory>

template<typename T>
class Iterator {
public:
    virtual ~Iterator() = default;
    virtual void first() = 0;
    virtual void next() = 0;
    virtual bool is_done() const = 0;
    virtual T& current() = 0;
};

template<typename T>
class Container {
public:
    virtual std::unique_ptr<Iterator<T>> create_iterator() = 0;
};

template<typename T>
class ConcreteIterator : public Iterator<T> {
    std::vector<T>& data_;
    size_t current_ = 0;
    
public:
    explicit ConcreteIterator(std::vector<T>& d) : data_(d) {}
    
    void first() override { current_ = 0; }
    void next() override { ++current_; }
    bool is_done() const override { return current_ >= data_.size(); }
    T& current() override { return data_[current_]; }
};

template<typename T>
class ConcreteContainer : public Container<T> {
    std::vector<T> data_;
    
public:
    void add(const T& t) { data_.push_back(t); }
    std::unique_ptr<Iterator<T>> create_iterator() override {
        return std::make_unique<ConcreteIterator<T>>(data_);
    }
};
```

### Template Method

```cpp
class AbstractClass {
public:
    // Template method
    void template_method() {
        step1();
        step2();
        hook();
    }
    
protected:
    virtual void step1() = 0;
    virtual void step2() { /* default implementation */ }
    virtual void hook() {}  // Optional override
    
public:
    virtual ~AbstractClass() = default;
};

class ConcreteClass : public AbstractClass {
protected:
    void step1() override {
        std::cout << "Step 1 implemented\n";
    }
    
    void step2() override {
        std::cout << "Step 2 overridden\n";
    }
};
```

### State

```cpp
#include <memory>

class State {
protected:
    class Context* context_;
    
public:
    virtual ~State() = default;
    void set_context(Context* c) { context_ = c; }
    virtual void handle() = 0;
};

class Context {
    std::unique_ptr<State> state_;
    
public:
    Context(State* s) : state_(s) { state_->set_context(this); }
    void set_state(std::unique_ptr<State> s) { 
        state_ = std::move(s);
        state_->set_context(this);
    }
    void request() { state_->handle(); }
};

class ConcreteStateA : public State {
public:
    void handle() override {
        std::cout << "State A handling, switching to B\n";
        context_->set_state(std::make_unique<ConcreteStateB>());
    }
};

class ConcreteStateB : public State {
public:
    void handle() override {
        std::cout << "State B handling\n";
    }
};
```

### Chain of Responsibility

```cpp
#include <memory>

class Handler {
protected:
    std::unique_ptr<Handler> next_;
    
public:
    Handler& set_next(std::unique_ptr<Handler> h) {
        next_ = std::move(h);
        return *next_;
    }
    
    virtual void handle(const std::string& request) {
        if (next_) {
            next_->handle(request);
        }
    }
    
    virtual ~Handler() = default;
};

class ConcreteHandlerA : public Handler {
public:
    void handle(const std::string& request) override {
        if (request == "A") {
            std::cout << "Handler A processed: " << request << '\n';
        } else {
            Handler::handle(request);
        }
    }
};

class ConcreteHandlerB : public Handler {
public:
    void handle(const std::string& request) override {
        if (request == "B") {
            std::cout << "Handler B processed: " << request << '\n';
        } else {
            Handler::handle(request);
        }
    }
};
```

### Visitor

```cpp
#include <memory>
#include <vector>

class ElementA;
class ElementB;

class Visitor {
public:
    virtual void visit(ElementA& e) = 0;
    virtual void visit(ElementB& e) = 0;
    virtual ~Visitor() = default;
};

class Element {
public:
    virtual ~Element() = default;
    virtual void accept(Visitor& v) = 0;
};

class ElementA : public Element {
public:
    void accept(Visitor& v) override { v.visit(*this); }
    void operation_a() { std::cout << "A\n"; }
};

class ElementB : public Element {
public:
    void accept(Visitor& v) override { v.visit(*this); }
    void operation_b() { std::cout << "B\n"; }
};

class ConcreteVisitor : public Visitor {
public:
    void visit(ElementA& e) override { 
        std::cout << "Visiting A: "; 
        e.operation_a(); 
    }
    void visit(ElementB& e) override { 
        std::cout << "Visiting B: "; 
        e.operation_b(); 
    }
};
```

### Mediator

```cpp
#include <memory>

class Mediator {
public:
    virtual void notify(const class Component& sender, const std::string& event) = 0;
    virtual ~Mediator() = default;
};

class Component {
protected:
    Mediator* mediator_ = nullptr;
    
public:
    void set_mediator(Mediator* m) { mediator_ = m; }
};

class ComponentA : public Component {
public:
    void do_a() { 
        std::cout << "A does A\n"; 
        mediator_->notify(*this, "a");
    }
};

class ComponentB : public Component {
public:
    void do_b() { 
        std::cout << "B does B\n"; 
        mediator_->notify(*this, "b");
    }
};

class ConcreteMediator : public Mediator {
    std::unique_ptr<ComponentA> comp_a_;
    std::unique_ptr<ComponentB> comp_b_;
    
public:
    ConcreteMediator() {
        comp_a_ = std::make_unique<ComponentA>();
        comp_b_ = std::make_unique<ComponentB>();
    }
    
    void notify(const Component& sender, const std::string& event) override {
        if (event == "a") {
            std::cout << "Mediator reacts to A, triggers B\n";
            comp_b_->do_b();
        }
    }
};
```

### Memento

```cpp
#include <memory>
#include <stack>

class Memento {
    int state_;
    
public:
    explicit Memento(int s) : state_(s) {}
    int get_state() const { return state_; }
};

class Originator {
    int state_ = 0;
    
public:
    void set_state(int s) { state_ = s; }
    int get_state() const { return state_; }
    
    std::unique_ptr<Memento> save() const {
        return std::make_unique<Memento>(state_);
    }
    
    void restore(const Memento& m) {
        state_ = m.get_state();
    }
};

class Caretaker {
    std::stack<std::unique_ptr<Memento>> history_;
    Originator& originator_;
    
public:
    explicit Caretaker(Originator& o) : originator_(o) {}
    
    void backup() {
        history_.push(originator_.save());
    }
    
    void undo() {
        if (history_.empty()) return;
        originator_.restore(*history_.top());
        history_.pop();
    }
};
```

## Modern C++ Idioms

### CRTP (Curiously Recurring Template Pattern)

```cpp
template<typename Derived>
class Base {
public:
    void interface() {
        static_cast<Derived*>(this)->implementation();
    }
};

class Derived : public Base<Derived> {
public:
    void implementation() {
        std::cout << "Derived implementation\n";
    }
};
```

### Pimpl (Pointer to Implementation)

```cpp
// Widget.h
class Widget {
public:
    Widget();
    ~Widget();
    Widget(Widget&&);
    Widget& operator=(Widget&&);
    
    void do_something();
    
private:
    struct Impl;
    std::unique_ptr<Impl> pimpl_;
};

// Widget.cpp
struct Widget::Impl {
    int data_;
    void helper() { /* ... */ }
};

Widget::Widget() : pimpl_(std::make_unique<Impl>()) {}
Widget::~Widget() = default;
Widget::Widget(Widget&&) = default;
Widget& Widget::operator=(Widget&&) = default;

void Widget::do_something() {
    pimpl_->helper();
}
```

### Type Erasure

```cpp
#include <functional>

class AnyCallable {
    struct Concept {
        virtual ~Concept() = default;
        virtual void call() = 0;
    };
    
    template<typename F>
    struct Model : Concept {
        F func_;
        Model(F f) : func_(std::move(b)) {}
        void call() override { func_(); }
    };
    
    std::unique_ptr<Concept> model_;
    
public:
    template<typename F>
    AnyCallable(F f) : model_(std::make_unique<Model<F>>(std::move(f))) {}
    
    void operator()() { model_->call(); }
};
```

## Best Practices

1. **Prefer composition over inheritance** - More flexible, less coupling
2. **Use smart pointers** - Manage ownership explicitly
3. **Prefer value semantics** - Avoid unnecessary indirection
4. **Return by value** - Enable RVO and move semantics
5. **Use std::function** - For strategy pattern flexibility
6. **RAII everything** - Automatic resource management
7. **Follow single responsibility** - Each class does one thing
8. **Depend on abstractions** - Program to interfaces
