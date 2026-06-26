# Game Engine Architecture

Guide to game engine architecture in C++, covering ECS, entity-component systems, and game-specific patterns.

## Entity-Component-System (ECS)

### Basic ECS

```cpp
#include <vector>
#include <unordered_map>
#include <memory>
#include <bitset>

using Entity = uint32_t;
const Entity INVALID_ENTITY = 0;

// Component - pure data
struct Position {
    float x, y, z;
};

struct Velocity {
    float dx, dy, dz;
};

struct Renderable {
    std::string model_name;
    std::string texture;
};

struct Collider {
    float radius;
    bool is_static;
};

// System - logic
class PhysicsSystem {
public:
    void update(float dt) {
        for (auto [entity, pos, vel] : view<Position, Velocity>()) {
            pos.x += vel.dx * dt;
            pos.y += vel.dy * dt;
            pos.z += vel.dz * dt;
        }
    }
};

// Registry
class Registry {
    std::vector<std::vector<uint8_t>> component_pools_;
    std::vector<std::bitset<64>> entity_masks_;
    std::unordered_map<std::string, size_t> component_ids_;
    Entity next_entity_ = 1;
    
public:
    template<typename T>
    size_t get_component_id() {
        static size_t id = component_ids_.size();
        component_ids_[typeid(T).name()] = id;
        return id;
    }
    
    Entity create_entity() {
        Entity e = next_entity_++;
        entity_masks_.resize(next_entity_);
        return e;
    }
    
    template<typename T>
    T& add_component(Entity e) {
        auto id = get_component_id<T>();
        if (component_pools_.size() <= id) {
            component_pools_.resize(id + 1);
        }
        // Grow pool if needed
        // Return reference to component
    }
    
    template<typename T>
    T* get_component(Entity e) {
        // Get component
        return nullptr;
    }
};
```

### EnTT (Popular ECS Library)

```cpp
#include <entt/entt.hpp>

struct Position {
    float x, y, z;
};

struct Velocity {
    float dx, dy, dz;
};

struct Renderable {
    std::string mesh;
    std::string material;
};

entt::registry registry;

void physics_update(float dt) {
    auto view = registry.view<Position, Velocity>();
    
    view.each([dt](auto& pos, auto& vel) {
        pos.x += vel.dx * dt;
        pos.y += vel.dy * dt;
        pos.z += vel.dz * dt;
    });
}

void render() {
    auto view = registry.view<const Position, const Renderable>();
    
    for (auto [entity, pos, render] : view.each()) {
        render_mesh(render.mesh, pos);
    }
}

// Create entity
auto entity = registry.create();
registry.emplace<Position>(entity, 0.0f, 0.0f, 0.0f);
registry.emplace<Velocity>(entity, 1.0f, 0.0f, 0.0f);
registry.emplace<Renderable>(entity, "player.fbx", "default.mat");

// Query
auto player = registry.view<Position, const Renderable>().front();
```

## Object Pool

```cpp
#include <vector>
#include <optional>

template<typename T>
class ObjectPool {
    struct Slot {
        T object;
        bool active = false;
    };
    
    std::vector<Slot> slots_;
    std::vector<size_t> free_indices_;
    
public:
    ObjectPool(size_t capacity = 1000) {
        slots_.reserve(capacity);
        for (size_t i = 0; i < capacity; ++i) {
            free_indices_.push_back(i);
        }
    }
    
    template<typename... Args>
    size_t create(Args&&... args) {
        if (free_indices_.empty()) {
            size_t idx = slots_.size();
            slots_.push_back({});
            slots_[idx].active = false;
            return idx;
        }
        
        size_t idx = free_indices_.back();
        free_indices_.pop_back();
        slots_[idx].object = T(std::forward<Args>(args)...);
        slots_[idx].active = true;
        return idx;
    }
    
    void destroy(size_t idx) {
        slots_[idx].active = false;
        slots_[idx].object = T{};
        free_indices_.push_back(idx);
    }
    
    T* get(size_t idx) {
        if (idx < slots_.size() && slots_[idx].active) {
            return &slots_[idx].object;
        }
        return nullptr;
    }
    
    template<typename F>
    void for_each(F&& func) {
        for (auto& slot : slots_) {
            if (slot.active) {
                func(slot.object);
            }
        }
    }
};
```

## Data-Oriented Design

### Structure of Arrays

```cpp
// Array of Structures (AoS) - cache unfriendly
struct Particle {
    float x, y, z;
    float vx, vy, vz;
    float r, g, b, a;
};

std::vector<Particle> particles;

// Structure of Arrays (SoA) - cache friendly
struct ParticleSystem {
    std::vector<float> pos_x, pos_y, pos_z;
    std::vector<float> vel_x, vel_y, vel_z;
    std::vector<float> color_r, color_g, color_b, color_a;
};

void update_particles(ParticleSystem& ps, float dt, size_t count) {
    for (size_t i = 0; i < count; ++i) {
        ps.pos_x[i] += ps.vel_x[i] * dt;
        ps.pos_y[i] += ps.vel_y[i] * dt;
        ps.pos_z[i] += ps.vel_z[i] * dt;
    }
}
```

### Cache Line Alignment

```cpp
#include <new>

constexpr size_t CACHE_LINE = 64;

struct AlignedData {
    alignas(CACHE_LINE) float data[64];
};

// False sharing prevention
struct alignas(CACHE_LINE) ThreadLocalCounter {
    uint64_t count = 0;
};

std::vector<ThreadLocalCounter> counters(num_threads);
```

## Spatial Partitioning

### Quadtree

```cpp
class Quadtree {
    struct Node {
        AABB bounds;
        std::vector<Entity> entities;
        std::unique_ptr<Node> children[4];
        const size_t max_entities = 4;
        const size_t max_depth = 8;
    };
    
    std::unique_ptr<Node> root_;
    size_t depth_ = 0;
    
public:
    void insert(Entity e, const AABB& bounds) {
        insert(root_, e, bounds, depth_);
    }
    
private:
    void insert(std::unique_ptr<Node>& node, Entity e, 
               const AABB& bounds, size_t depth) {
        if (!node) node = std::make_unique<Node>();
        
        if (depth < max_depth && node->children[0]) {
            // Find child and insert
            int quadrant = get_quadrant(node->bounds, bounds);
            if (quadrant >= 0) {
                insert(node->children[quadrant], e, bounds, depth + 1);
                return;
            }
        }
        
        node->entities.push_back(e);
        
        if (node->entities.size() > max_entities && depth < max_depth) {
            split(*node);
        }
    }
};
```

## Update Loop

```cpp
class Game {
    double current_time_ = 0;
    double accumulator_ = 0;
    const double dt_ = 1.0 / 60.0;
    
public:
    void run() {
        double new_time = get_time();
        double frame_time = new_time - current_time_;
        current_time_ = new_time;
        
        accumulator_ += frame_time;
        
        while (accumulator_ >= dt_) {
            update(dt_);
            accumulator_ -= dt_;
        }
        
        render(accumulator_ / dt_);  // Interpolation
    }
    
    void update(double dt) {
        input_.process();
        physics_.update(dt);
        audio_.update();
        script_.update(dt);
    }
};
```

## Best Practices

1. **Use ECS** - For large numbers of entities
2. **Data-oriented design** - Cache-friendly layouts
3. **Object pools** - Avoid allocations in gameplay
4. **Spatial partitioning** - For collision detection
5. **Fixed timestep** - Consistent physics
6. **Memory pools** - Pre-allocate game objects

## Resources

- [EnTT GitHub](https://github.com/skypjack/entt)
- [Data-Oriented Design - Richard Fabian](https://dataorienteddesign.github.io/dodmain/)
