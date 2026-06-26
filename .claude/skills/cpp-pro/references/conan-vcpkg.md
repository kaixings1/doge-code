# Conan and vcpkg

Guide to C++ package managers Conan and vcpkg for dependency management.

## Conan

### Basic Usage

```bash
# Install Conan
pip install conan

# Create conanfile.txt
[requires]
boost/1.83.0
nlohmann_json/3.11.2
fmt/10.2.1

[generators]
cmake_find_package
cmake_paths

[options]
boost:shared=False
nlohmann_json:header_only=True
```

### conanfile.py

```python
from conans import ConanFile, CMake

class MyConan(ConanFile):
    name = "mylib"
    version = "1.0.0"
    settings = "os", "compiler", "build_type", "arch"
    exports_sources = "CMakeLists.txt", "src/*"
    generators = "cmake"
    
    def requirements(self):
        self.requires("boost/1.83.0")
        self.requires("nlohmann_json/3.11.2")
    
    def build(self):
        cmake = CMake(self)
        cmake.configure()
        cmake.build()
    
    def package(self):
        self.copy("*.h", dst="include", src="src")
        self.copy("*.lib", dst="lib", keep_path=False)
        self.copy("*.dll", dst="bin", keep_path=False)
    
    def package_info(self):
        self.cpp_info.libs = ["mylib"]
        self.cpp_info.includedirs = ["include"]
```

### CMake Integration

```cmake
# CMakeLists.txt
cmake_minimum_required(VERSION 3.15)
project(MyProject)

# Include Conan-generated file
include(${CMAKE_BINARY_DIR}/conanbuildinfo.cmake)
conan_basic_setup()

find_package(Boost REQUIRED)
find_package(nlohmann_json REQUIRED)

add_executable(myapp main.cpp)
target_link_libraries(myapp 
    ${CONAN_LIBS}
    Boost::filesystem
    nlohmann_json::nlohmann_json
)
```

## vcpkg

### Basic Usage

```bash
# Install vcpkg
git clone https://github.com/Microsoft/vcpkg.git
./vcpkg/bootstrap-vcpkg.bat  # Windows
./vcpkg/bootstrap-vcpkg.sh    # Linux/macOS

# Install packages
./vcpkg/vcpkg install boost
./vcpkg/vcpkg install nlohmann-json
./vcpkg/vcpkg install --triplet=x64-windows-static

# Search
./vcpkg/vcpkg search boost

# List installed
./vcpkg/vcpkg list
```

### vcpkg.json

```json
{
    "name": "myproject",
    "version": "1.0.0",
    "dependencies": [
        "boost",
        "nlohmann-json",
        "fmt"
    ],
    "overrides": [
        {
            "name": "boost",
            "version": "1.83.0"
        }
    ],
    "features": {
        "myproject": {
            "description": "My project",
            "dependencies": []
        }
    }
}
```

### CMake Integration

```cmake
# CMakeLists.txt
cmake_minimum_required(VERSION 3.15)
project(MyProject)

# Include vcpkg
if(CMAKE_TOOLCHAIN_FILE)
    include(${CMAKE_TOOLCHAIN_FILE})
endif()

find_package(Boost REQUIRED)
find_package(nlohmann_json REQUIRED)
find_package(fmt REQUIRED)

add_executable(myapp main.cpp)
target_link_libraries(myapp 
    PRIVATE
    Boost::filesystem
    nlohmann_json::nlohmann_json
    fmt::fmt
)
```

## Comparison

| Feature | Conan | vcpkg |
|---------|-------|-------|
| Lock file | Yes | Yes (manifest mode) |
| Binary caching | Yes | Yes |
| Cross-compilation | Yes | Yes |
| Integration | CMake, Meson, others | CMake primarily |
| Registry | ConanCenter | Built-in |

## Best Practices

1. **Use version ranges** - Allow minor updates
2. **Lock files** - For reproducible builds
3. **Overlay ports** - Custom modifications
4. **Binary caching** - Faster CI builds

## Resources

- [Conan Documentation](https://docs.conan.io/)
- [vcpkg Documentation](https://learn.microsoft.com/en-us/vcpkg/)
