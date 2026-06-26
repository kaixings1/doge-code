# C++ and Rust Interoperability

Guide to interoperability between C++ and Rust, covering FFI, the CXX crate, and hybrid development.

## CXX Crate

### Basic Setup

```rust
// src/lib.rs
cxx::bridge! {
    unsafe extern "Rust" {
        fn rust_function(input: i32) -> i32;
    }
}

pub fn rust_function(input: i32) -> i32 {
    input * 2
}
```

```cpp
// main.cpp
#include "lib.h"
#include <iostream>

int main() {
    std::cout << rust_function(21) << '\n';
}
```

```toml
# Cargo.toml
[dependencies]
cxx = "1.0"

[build-dependencies]
cxx-build = "1.0"

[[bin]]
name = "app"
path = "main.cpp"
```

## Shared Types

### C++ to Rust

```rust
// Rust side
#[repr(C)]
pub struct Point {
    pub x: f64,
    pub y: f64,
}

cxx::bridge! {
    extern "Rust" {
        fn distance(p1: &Point, p2: &Point) -> f64;
    }
}

pub fn distance(p1: &Point, p2: &Point) -> f64 {
    ((p2.x - p1.x).powi(2) + (p2.y - p1.y).powi(2)).sqrt()
}
```

```cpp
// C++ side
#include "lib.h"
#include <iostream>

int main() {
    Point p1{0, 0};
    Point p2{3, 4};
    std::cout << distance(&p1, &p2) << '\n';  // 5
}
```

### Rust to C++

```rust
// Rust side
#[repr(C)]
pub struct RustData {
    pub id: u64,
    pub name: CxxString,
}

cxx::bridge! {
    extern "Rust" {
        fn create_data() -> RustData;
        fn process_data(data: &mut RustData);
    }
}

pub fn create_data() -> RustData {
    RustData {
        id: 42,
        name: "hello".into_cxx_string(),
    }
}

pub fn process_data(data: &mut RustData) {
    data.id *= 2;
}
```

## C++ Callbacks

```rust
cxx::bridge! {
    unsafe extern "C++" {
        include!("callback.h");
        
        type Callback = Callback;
        
        fn set_callback(callback: UniquePtr<Callback>);
    }
}

pub struct Callback {
    on_event: Box<dyn FnMut(i32)>,
}

impl Callback {
    pub fn new<F>(on_event: F) -> Self 
    where 
        F: FnMut(i32) + 'static 
    {
        Self { on_event: Box::new(on_event) }
    }
    
    pub fn call(&mut self, value: i32) {
        (self.on_event)(value);
    }
}
```

## Manual FFI

### C to Rust

```c
// test.h
#ifndef TEST_H
#define TEST_H

int add(int a, int b);
void process_array(int* arr, size_t len);

#endif
```

```rust
// src/lib.rs
#[no_mangle]
pub extern "C" fn add(a: c_int, b: c_int) -> c_int {
    a + b
}

#[no_mangle]
pub unsafe extern "C" fn process_array(arr: *mut c_int, len: usize) {
    let slice = std::slice::from_raw_parts_mut(arr, len);
    for item in slice.iter_mut() {
        *item *= 2;
    }
}
```

### Rust to C

```rust
// Functions exported via #[no_mangle]
#[no_mangle]
pub extern "C" fn rust_calculate(input: f64) -> f64 {
    input.sin() * input.cos()
}
```

```c
// main.c
#include <stdio.h>

extern double rust_calculate(double input);

int main() {
    printf("%f\n", rust_calculate(3.14));
    return 0;
}
```

## C++ Smart Pointers

```rust
cxx::bridge! {
    extern "Rust" {
        type SharedPtrCpp;

        fn make_cpp_ptr() -> SharedPtrCpp;
        fn use_cpp_ptr(ptr: &SharedPtrCpp);
    }
}
```

## Error Handling

```rust
cxx::bridge! {
    extern "Rust" {
        fn risky_operation(input: i32) -> Result<i32, String>;
    }
}

pub fn risky_operation(input: i32) -> Result<i32, String> {
    if input < 0 {
        Err("Input must be non-negative".into())
    } else {
        Ok(input * 2)
    }
}
```

## Best Practices

1. **Use CXX** - Automatic type mapping, safety
2. **Repr(C)** - For shared structs
3. **Avoid raw pointers** - Use references
4. **Handle errors** - Result types for fallible FFI

## Resources

- [CXX Book](https://cxx.rs/)
- [Rust FFI Guide](https://doc.rust-lang.org/nomicon/)
- [CXX GitHub](https://github.com/dtolnay/cxx)
