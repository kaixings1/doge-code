package com.doge.code

import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import com.intellij.ui.content.ContentFactory
import java.awt.BorderLayout
import java.awt.Dimension
import javax.swing.*

/**
 * Doge Code 工具窗口工厂
 * 创建侧边栏聊天面板
 */
class DogeCodeToolWindowFactory : ToolWindowFactory {
    override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
        val panel = DogeCodePanel()
        val content = ContentFactory.getInstance().createContent(panel, "", false)
        toolWindow.contentManager.addContent(content)
    }
}

/**
 * Doge Code 面板
 * 聊天和统计的主界面
 */
class DogeCodePanel : JPanel(BorderLayout()) {
    private val service = DogeCodeService.getInstance()

    init {
       PreferredSize = Dimension(350, 600)

        // 顶部状态栏
        val statusPanel = JPanel(BorderLayout())
        val statusLabel = JLabel("🔄 连接中...")
        statusPanel.add(statusLabel, BorderLayout.WEST)

        // 连接状态检查
        Thread {
            if (service.checkConnection()) {
                statusLabel.setText("✅ 已连接")
                statusLabel.foreground = java.awt.Color(0, 128, 0)
            } else {
                statusLabel.setText("❌ 未连接 - 请启动仪表盘")
                statusLabel.foreground = java.awt.Color(200, 0, 0)
            }
        }.start()

        add(statusPanel, BorderLayout.NORTH)

        // 聊天区域
        val chatArea = JTextArea()
        chatArea.isEditable = false
        chatArea.text = "🐕 Doge Code AI 助手\n\n请输入你的问题...\n"
        val scrollPane = JScrollPane(chatArea)
        add(scrollPane, BorderLayout.CENTER)

        // 底部输入区域
        val inputPanel = JPanel(BorderLayout())
        val inputField = JTextField()
        val sendButton = JButton("发送")

        sendButton.addActionListener {
            val message = inputField.text
            if (message.isNotBlank()) {
                chatArea.append("你: $message\n")
                inputField.text = ""
                // TODO: 发送到 Doge Code API
            }
        }

        inputPanel.add(inputField, BorderLayout.CENTER)
        inputPanel.add(sendButton, BorderLayout.EAST)
        add(inputPanel, BorderLayout.SOUTH)
    }
}
