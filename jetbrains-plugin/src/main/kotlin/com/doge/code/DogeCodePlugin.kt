package com.doge.code

import com.intellij.openapi.project.Project
import com.intellij.openapi.startup.ProjectActivity

/**
 * Doge Code 插件入口
 */
class DogeCodePlugin : ProjectActivity {
    override suspend fun execute(project: Project) {
        // 插件初始化
        println("Doge Code 插件已加载")
    }
}
