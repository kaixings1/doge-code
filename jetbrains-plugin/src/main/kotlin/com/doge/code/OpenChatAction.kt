package com.doge.code

import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent

/**
 * 打开 Doge Code 聊天动作
 */
class OpenChatAction : AnAction("打开 Doge Code 聊天") {
    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        com.intellij.openapi.wm.ToolWindowManager.getInstance(project)
            .getToolWindow("Doge Code")
            ?.show()
    }
}
