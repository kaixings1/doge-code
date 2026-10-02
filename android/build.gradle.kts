// 根构建脚本：只声明插件版本，不引入依赖。
// 版本约束：AGP 8.6+ 才支持 compileSdk 35（app 模块用到）。AGP 8.5.x 上限是 34，
// 配 35 会在配置阶段直接报 "compileSdk 35 requires AGP 8.6.0 or higher"。
plugins {
    id("com.android.application") version "8.7.3" apply false
    id("org.jetbrains.kotlin.android") version "1.9.24" apply false
}
