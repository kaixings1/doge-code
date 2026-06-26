# WebAssembly and Web Development

Guide to compiling C++ to WebAssembly and building web applications with C++.

## Emscripten

### Basic Compilation

```bash
# Install emscripten
emsdk install latest
emsdk activate latest
source ./emsdk_env.sh

# Compile to HTML
emcc input.cpp -o output.html

# Compile to WASM
emcc input.cpp -o output.wasm

# With optimizations
emcc -O3 input.cpp -o output.wasm

# With debug info
emcc -g input.cpp -o output.html
```

### WebGL Example

```cpp
#include <emscripten.h>
#include <emscripten/html5.h>
#include <GLES2/gl2.h>

// Global state
GLuint program;
GLint position_loc;

// Vertex shader
const char* vertex_shader = R"(
    attribute vec2 position;
    void main() {
        gl_Position = vec4(position, 0.0, 1.0);
    }
)";

// Fragment shader  
const char* fragment_shader = R"(
    precision mediump float;
    void main() {
        gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);
    }
)";

void init() {
    // Create shaders
    GLuint vs = glCreateShader(GL_VERTEX_SHADER);
    glShaderSource(vs, 1, &vertex_shader, nullptr);
    glCompileShader(vs);
    
    GLuint fs = glCreateShader(GL_FRAGMENT_SHADER);
    glShaderSource(fs, 1, &fragment_shader, nullptr);
    glCompileShader(fs);
    
    program = glCreateProgram();
    glAttachShader(program, vs);
    glAttachShader(program, fs);
    glLinkProgram(program);
    
    position_loc = glGetAttribLocation(program, "position");
}

void render() {
    glClearColor(0.0, 0.0, 0.0, 1.0);
    glClear(GL_COLOR_BUFFER_BIT);
    
    glUseProgram(program);
    
    float vertices[] = {0.0, 0.5, -0.5, -0.5, 0.5, -0.5};
    glVertexAttribPointer(position_loc, 2, GL_FLOAT, GL_FALSE, 0, vertices);
    glEnableVertexAttribArray(position_loc);
    
    glDrawArrays(GL_TRIANGLES, 0, 3);
}

int main() {
    init();
    
    emscripten_set_main_loop(render, 0, 1);
    
    return 0;
}
```

### Interop with JavaScript

```cpp
#include <emscripten.h>
#include <emscripten/bind.h>

// Call from JavaScript
EM_JS(void, js_function, (int x), {
    console.log('Called from C++ with:', x);
});

void call_js() {
    js_function(42);
}

// Export C++ to JavaScript
EMSCRIPTEN_BINDINGS(my_module) {
    emscripten::function("add", &add);
    emscripten::function("get_vector", &get_vector);
    emscripten::class_<MyClass>("MyClass")
        .constructor<>()
        .function("method", &MyClass::method);
}
```

```javascript
// JavaScript usage
var module = await initModule();
var result = module.add(1, 2);
var obj = new module.MyClass();
obj.method();
```

## WASI (WebAssembly System Interface)

### WASI Compilation

```bash
# Compile for WASI
clang++ --target=wasm32-wasi --sysroot=/path/to/wasi-sysroot \
    -O3 -Wall -o output.wasm input.cpp

# Or with emscripten
emcc -O3 -s WASM=1 -s ENVIRONMENT=wasi input.cpp -o output.wasm
```

### File I/O with WASI

```cpp
#include <stdio.h>

int main() {
    FILE* f = fopen("/hello.txt", "r");
    if (f) {
        char buffer[256];
        fgets(buffer, sizeof(buffer), f);
        fclose(f);
    }
    return 0;
}
```

## Asm.js (Legacy)

```bash
# Compile to asm.js (slower, wider compatibility)
emcc -s WASM=0 input.cpp -o output.js
```

## Web Workers

```cpp
// Main thread
#include <emscripten/threading.h>

emscripten_worker_respond(const char* data, size_t size);

// Worker thread
#include <emscripten/worker_responses.h>

void worker_main() {
    // Process
    emscripten_worker_respond("done", 4);
}
```

## Best Practices

1. **Minimize allocations** - WASM has limited memory
2. **Use Emscripten** - For best compatibility
3. **Profile** - Check performance in browser
4. **Test on multiple browsers** - Compatibility varies

## Resources

- [Emscripten Documentation](https://emscripten.org/)
- [WASI Specification](https://github.com/WebAssembly/WASI)
- [MDN WebAssembly Guide](https://developer.mozilla.org/en-US/docs/WebAssembly)
