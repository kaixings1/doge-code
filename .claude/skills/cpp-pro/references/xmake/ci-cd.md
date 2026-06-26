# CI/CD Integration

Xmake integrates well with various CI/CD systems. This guide covers common CI platforms and best practices.

## GitHub Actions

### Basic Workflow

```yaml
name: Build

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Install xmake
        uses: xmake-io/setup-xmake@v1
      
      - name: Run tests
        run: xmake test
      
      - name: Build
        run: xmake
```

### Multiple Platforms

```yaml
name: Cross Platform Build

on: [push, pull_request]

jobs:
  build:
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
    
    runs-on: ${{ matrix.os }}
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Install xmake
        uses: xmake-io/setup-xmake@v1
        with:
          xmake-version: latest
      
      - name: Build
        run: xmake
      
      - name: Test
        run: xmake test
```

### Android CI

```yaml
name: Android Build

on: [push, pull_request]

jobs:
  android:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup NDK
        uses: android-actions/setup-android@v2
      
      - name: Install xmake
        uses: xmake-io/setup-xmake@v1
      
      - name: Build Android
        run: |
          xmake f -p android --ndk=$ANDROID_NDK_HOME
          xmake -r
```

### iOS CI (macOS)

```yaml
name: iOS Build

on: [push, pull_request]

jobs:
  ios:
    runs-on: macos-latest
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Install xmake
        uses: xmake-io/setup-xmake@v1
      
      - name: Build iOS
        run: |
          xmake f -p iphoneos -a arm64
          xmake -r
```

### With Cache

```yaml
name: Build with Cache

on: [push, pull_request]

jobs:
  build:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup xmake
        uses: xmake-io/setup-xmake@v1
        with:
          xmake-version: latest
      
      - name: Cache xmake packages
        uses: actions/cache@v3
        with:
          path: ~/.xmake/packages
          key: ${{ runner.os }}-xmake-${{ hashFiles('**/xmake.lua') }}
          restore-keys: |
            ${{ runner.os }}-xmake-
      
      - name: Build and Test
        run: |
          xmake
          xmake test
```

## GitLab CI

### Basic Pipeline

```yaml
stages:
  - build
  - test

build:
  stage: build
  image: ubuntu:latest
  before_script:
    - curl -fsSL https://xmake.io/shget.text | bash
  script:
    - xmake

test:
  stage: test
  image: ubuntu:latest
  before_script:
    - curl -fsSL https://xmake.io/shget.text | bash
  script:
    - xmake test
```

### With Matrix

```yaml
stages:
  - build

build:
  stage: build
  image: ubuntu:latest
  before_script:
    - curl -fsSL https://xmake.io/shget.text | bash
  script:
    - xmake f -p $PLATFORM
    - xmake
  parallel:
    matrix:
      - PLATFORM: [linux, windows, macos]
```

## CircleCI

```yaml
version: 2.1

jobs:
  build:
    docker:
      - image: ubuntu:latest
    steps:
      - checkout
      - run:
          name: Install xmake
          command: |
            curl -fsSL https://xmake.io/shget.text | bash
      - run:
          name: Build
          command: xmake
      - run:
          name: Test
          command: xmake test

workflows:
  version: 2
  build-and-test:
    jobs:
      - build
```

## Travis CI

```yaml
language: cpp

matrix:
  include:
    - os: linux
      dist: focal
    - os: macos
      osx_version: catalina
    - os: windows

before_install:
  - curl -fsSL https://xmake.io/shget.text | bash

script:
  - xmake
  - xmake test

cache:
  directories:
    - ~/.xmake/packages
```

## Azure Pipelines

```yaml
trigger:
  - main

pr:
  - main

jobs:
  - job: Build
    pool:
      vmImage: 'ubuntu-latest'
    steps:
      - script: |
          curl -fsSL https://xmake.io/shget.text | bash
        displayName: 'Install xmake'
      
      - script: xmake
        displayName: 'Build'
      
      - script: xmake test
        displayName: 'Test'
```

## Best Practices

### Use xmake-version Specifier

Pin xmake version for reproducibility:

```yaml
- uses: xmake-io/setup-xmake@v1
  with:
    xmake-version: 3.0.7
```

### Enable Caching

Cache xmake packages to speed up CI:

```yaml
- uses: actions/cache@v3
  with:
    path: ~/.xmake/packages
    key: ${{ runner.os }}-xmake-${{ hashFiles('**/xmake.lua') }}
```

### Run Tests with Exit Code

For CI automation:

```bash
xmake test --exit0
```

### Verbose Output for CI Logs

```bash
xmake test -v --verbose
```

### Conditional Builds

Build only on specific events:

```yaml
on:
  push:
    branches: [main, develop]
  pull_request:
```

### Artifacts

Upload build artifacts:

```yaml
- name: Upload artifacts
  uses: actions/upload-artifact@v3
  with:
    name: build-output
    path: build/*
```

## Installation Scripts

### Linux/macOS

```bash
bash <(curl -fsSL https://xmake.io/shget.text)
```

### Windows

```powershell
Invoke-Expression (Invoke-WebRequest 'https://xmake.io/shget.ps1' -UseBasicParsing).Content
```

### Specific Version

```bash
bash <(curl -fsSL https://xmake.io/shget.text) -v 3.0.7
```
