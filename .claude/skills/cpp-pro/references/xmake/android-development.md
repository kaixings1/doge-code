# Android Development

Xmake provides comprehensive Android NDK support for building native Android libraries and applications.

## Basic Android NDK Setup

### Configuration

```bash
$ xmake f -p android --ndk=/path/to/ndk
$ xmake
```

### Global Configuration

Save NDK path permanently:

```bash
$ xmake g --ndk=~/android-ndk-r19c
```

### Architecture Selection

```bash
$ xmake f -p android --ndk=/path/to/ndk -a arm64-v8a
$ xmake f -p android --ndk=/path/to/ndk -a armeabi-v7a
```

Supported architectures:
- `armv7-a`
- `arm64-v8a`
- `armv5te`
- `mips`
- `mips64`
- `i386`
- `x86_64`

## C++ STL Configuration

### STL Options

```bash
$ xmake f -p android --ndk=xxx --ndk_cxxstl=llvmstl_shared
```

Available options:
- `llvmstl_static`
- `llvmstl_shared`
- `gnustl_static`
- `gnustl_shared`
- `stlport_static`
- `stlport_shared`

Xmake defaults to `llvm-c++` if the NDK version supports it, otherwise falls back to `gnustl`.

## API Version

Set the Android API level:

```bash
$ xmake f -p android --ndk=xxx --ndk_sdkver=16
```

## Android Native Apps

Build native Android applications using the `android.native_app` rule:

```lua
add_rules("mode.debug", "mode.release")

target("android_app")
    set_kind("binary")
    add_files("src/*.cpp")
    add_rules("android.native_app", {
        android_manifest = "src/android/AndroidManifest.xml",
        package_name = "com.xmake.demo",
        android_sdk_version = "35"
    })
```

### AndroidManifest.xml

```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.xmake.demo"
    android:versionCode="1"
    android:versionName="1.0" >
    <uses-sdk android:minSdkVersion="16" android:targetSdkVersion="35" />
    <application android:label="XmakeDemo" android:hasCode="false">
        <activity android:name="android.app.NativeActivity"
                  android:label="XmakeDemo"
                  android:configChanges="orientation|keyboardHidden">
            <meta-data android:name="android.app.lib_name" android:value="android_app" />
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
```

## Platform-Specific Configuration

Use `is_plat("android")` to add Android-specific settings:

```lua
target("test")
    set_kind("shared")
    add_files("src/*.c")
    if is_plat("android") then
        add_defines("ANDROID_SPECIFIC_DEFINE")
        add_links("log")  # Android log library
    end
```

## Using Android NDK Toolchain

### Specify Toolchain

```bash
$ xmake f -p android --toolchain=ndk[gcc] --ndk=/path/to/ndk
```

### Emscripten Toolchain

```bash
$ xmake f -p android --ndk=/path/to/ndk --toolchain=wasi
```

## Best Practices

1. Use global config (`xmake g --ndk=`) for frequently used NDK paths
2. Choose appropriate API version for your minimum Android version
3. Use `llvm-c++` STL for newer NDK versions
4. Add `add_links("log")` for Android logging
5. Use platform detection for Android-specific code
