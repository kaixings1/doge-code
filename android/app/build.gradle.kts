plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.dogecode.mobile"
    // 35 = Android 15。目标机是 Android 16，用较新的 targetSdk 可避免
    // MIUI/Android 对「低 targetSdk 应用」的额外安装拦截（--bypass-low-target-sdk-block）。
    compileSdk = 35

    defaultConfig {
        applicationId = "com.dogecode.mobile"
        minSdk = 24
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"
    }

    buildTypes {
        release {
            // 自用工具，不配置签名；release 仍用 debug 签名以便直接安装。
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.appcompat:appcompat:1.7.0")
    // OnBackPressedCallback / OnBackPressedDispatcher 来自 activity，不由 appcompat 保证传递引入
    implementation("androidx.activity:activity-ktx:1.9.2")
    implementation("androidx.webkit:webkit:1.11.0")
}
