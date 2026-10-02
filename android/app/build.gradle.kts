plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.dogecode.mobile"
    // 35 = Android 15。目标机是 Android 16，用较新的 targetSdk 可避免
    // MIUI/Android 对「低 targetSdk 应用」的额外安装拦截（--bypass-low-target-sdk-block）。
    compileSdk = 35
    // 显式指定，避免 AGP 默认去要一个本地没装的版本（本机装的是 35.0.0，
    // AGP 8.7 默认找 34.0.0 会报 "Failed to find Build Tools revision 34.0.0"，
    // 且离线/受限网络下无法自动下载）。
    buildToolsVersion = "35.0.0"

    defaultConfig {
        applicationId = "com.dogecode.mobile"
        minSdk = 24
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"
    }

    // 显式指定工程内的 debug keystore，不用 ~/.android/debug.keystore。
    // 原因：本机 ~/.android/debug.keystore.lock 出现无法清除的 AccessDenied
    // （ACL 正常、无进程持有），导致 validateSigningDebug 失败。改用工程内
    // keystore 可绕开该残留锁，且不依赖用户目录状态。
    //
    // keystore 被 .gitignore 排除（含私钥），因此首次构建时若不存在则自动生成，
    // 避免新克隆的仓库直接构建失败。
    val localKeystore = file("../debug.keystore")
    if (!localKeystore.exists()) {
        providers.exec {
            commandLine(
                "${System.getProperty("java.home")}/bin/keytool", "-genkeypair",
                "-keystore", localKeystore.absolutePath,
                "-storepass", "android", "-keypass", "android",
                "-alias", "androiddebugkey", "-keyalg", "RSA",
                "-keysize", "2048", "-validity", "10000",
                "-dname", "CN=Android Debug,O=Android,C=US",
            )
        }.result.get()
        logger.lifecycle("已自动生成 $localKeystore")
    }

    signingConfigs {
        create("localDebug") {
            storeFile = localKeystore
            storePassword = "android"
            keyAlias = "androiddebugkey"
            keyPassword = "android"
        }
    }

    buildTypes {
        debug {
            signingConfig = signingConfigs.getByName("localDebug")
        }
        release {
            // 自用工具，release 也用 debug 签名以便直接安装。
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("localDebug")
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
