# CI/CD for C++ Projects

Comprehensive guide to continuous integration and deployment for C++ projects.

## GitHub Actions

### Basic Workflow

```yaml
name: C++ CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs, develop:
  build:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Install dependencies
        run: |
          sudo apt-get update
          sudo apt-get install -y cmake g++ libgtest-dev
      
      - name: Configure
        run: cmake -B build -DCMAKE_BUILD_TYPE=Release
        
      - name: Build
        run: cmake --build build -j$(nproc)
        
      - name: Test
        working-directory: build
        run: ctest --output-on-failure
```

### Multiple Compilers

```yaml
jobs:
  build:
    strategy:
      matrix:
        compiler: [gcc-11, gcc-12, clang-14, clang-15]
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Set up compiler
        run: |
          echo "CXX=${{ matrix.compiler }}" >> $GITHUB_ENV
      
      - name: Build and test
        run: |
          cmake -B build
          cmake --build build
          ctest --test-dir build --output-on-failure
```

### Caching

```yaml
      - name: Cache CMake
        uses: actions/cache@v3
        with:
          path: |
            build/
            ~/.cmake/
          key: ${{ runner.os }}-cmake-${{ hashFiles('**/CMakeLists.txt') }}
          restore-keys: |
            ${{ runner.os }}-cmake-
```

### Cross-Compilation

```yaml
jobs:
  build:
    strategy:
      matrix:
        include:
          - os: ubuntu-latest
            cmake_args: -DCMAKE_TOOLCHAIN_FILE=cmake/linux-x64.cmake
          - os: macos-latest
            cmake_args: -DCMAKE_OSX_ARCHITECTURES=arm64
          - os: windows-latest
            cmake_args: -G "Visual Studio 17 2022"
```

## GitLab CI

```yaml
stages:
  - build
  - test
  - deploy

variables:
  BUILD_TYPE: Release

.build:
  stage: build
  script:
    - cmake -B build -DCMAKE_BUILD_TYPE=$BUILD_TYPE
    - cmake --build build -j$(nproc)
  artifacts:
    paths:
      - build/
    expire_in: 1 day

test:
  stage: test
  script:
    - cmake --build build
    - ctest --test-dir build --output-on-failure
  coverage: '/TOTAL.*\s+(\d+%)$/'

.deploy:
  stage: deploy
  script:
    - cmake --install build
```

## CMake + CTest

### Basic Configuration

```cmake
# CMakeLists.txt
enable_testing()

add_executable(test1 tests/test1.cc)
add_test(NAME Test1 COMMAND test1)

add_executable(tests tests.cc)
add_test(NAME Tests COMMAND tests)
target_link_libraries(tests PRIVATE gtest_main gmock_main)
include(GoogleTest)
gtest_discover_tests(tests)
```

### Running Tests

```bash
# Run all tests
ctest

# Run specific test
ctest -R my_test

# Verbose output
ctest -V

# Parallel
ctest -j4

# With coverage
cmake -B build -DCMAKE_BUILD_TYPE=Debug -DCMAKE_CXX_FLAGS="--coverage"
```

## Docker CI

### Dockerfile

```dockerfile
FROM ubuntu:22.04

RUN apt-get update && apt-get install -y \
    cmake \
    g++ \
    gdb \
    valgrind \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY . .
RUN cmake -B build && cmake --build build

ENTRYPOINT ["ctest", "--test-dir", "build"]
```

### Docker Compose for Testing

```yaml
version: '3.8'
services:
  build:
    build: .
    volumes:
      - ./:/app
    command: cmake --build build -j$(nproc)
  
  test:
    build: .
    volumes:
      - ./:/app
    command: ctest --test-dir build --output-on-failure --timeout 60
  
  clang-tidy:
    build: .
    volumes:
      - ./:/app
    command: cmake --build build --target tidy
  
  sanitize:
    build: .
    volumes:
      - ./:/app
    environment:
      - CMAKE_CXX_FLAGS=-fsanitize=address,undefined
    command: cmake -B build -DCMAKE_BUILD_TYPE=Debug && cmake --build build && ctest --test-dir build
```

## Code Quality

### clang-tidy

```yaml
clang-tidy:
  stage: test
  script:
    - cmake -B build
    - cmake --build build
    - find . -name "*.cc" -exec clang-tidy -p compile_commands.json {} \;
```

### Code Coverage

```cmake
# CMakeLists.txt
option(ENABLE_COVERAGE "Enable code coverage" ON)

if(ENABLE_COVERAGE)
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} --coverage -g -O0")
    set(CMAKE_C_FLAGS "${CMAKE_C_FLAGS} --coverage -g -O0")
endif()
```

```bash
# Generate coverage report
lcov --capture --directory build --output-file coverage.info
lcov --remove coverage.info '*/test/*' --output-file coverage.info
genhtml coverage.info --output-directory coverage_report
```

## Sanitizers

### ASan (Address Sanitizer)

```cmake
set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -fsanitize=address -fno-omit-frame-pointer")
set(CMAKE_EXE_LINKER_FLAGS "${CMAKE_EXE_LINKER_FLAGS} -fsanitize=address")
```

### UBSan (Undefined Behavior Sanitizer)

```cmake
set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -fsanitize=undefined")
set(CMAKE_EXE_LINKER_FLAGS "${CMAKE_EXE_LINKER_FLAGS} -fsanitize=undefined")
```

### Combined

```cmake
set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -fsanitize=address,undefined,thread")
```

## Best Practices

1. **Cache dependencies** - Speed up CI builds
2. **Run tests in parallel** - Faster feedback
3. **Use matrix builds** - Test multiple configurations
4. **Enable warnings as errors** - Catch issues early
5. **Run sanitizers in CI** - Detect bugs automatically
6. **Fail fast** - Stop on first error
7. **Artifact retention** - Don't keep everything forever

## Resources

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [GitLab CI Documentation](https://docs.gitlab.com/ee/ci/)
- [CMake Testing](https://cmake.org/cmake/help/latest/module/CTest.html)
- [LLVM Sanitizers](https://clang.llvm.org/docs/)
