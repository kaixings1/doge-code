package com.doge.code

import com.intellij.openapi.options.Configurable
import javax.swing.*
import java.awt.*

/**
 * Doge Code 设置面板
 */
class DogeCodeConfigurable : Configurable {
    private var panel: JPanel? = null
    private var urlField: JTextField? = null
    private var chatCheckBox: JCheckBox? = null
    private var autocompleteCheckBox: JCheckBox? = null

    override fun getDisplayName(): String = "Doge Code"

    override fun createComponent(): JComponent {
        if (panel == null) {
            panel = JPanel(GridLayout(0, 1, 5, 10))

            // 服务器地址
            val urlPanel = JPanel(BorderLayout())
            urlPanel.add(JLabel("服务器地址: "), BorderLayout.WEST)
            urlField = JTextField("http://127.0.0.1:3456")
            urlPanel.add(urlField, BorderLayout.CENTER)
            panel!!.add(urlPanel)

            // 启用聊天
            chatCheckBox = JCheckBox("启用聊天功能", true)
            panel!!.add(chatCheckBox)

            // 启用自动补全
            autocompleteCheckBox = JCheckBox("启用自动补全", false)
            panel!!.add(autocompleteCheckBox)

            // 连接测试按钮
            val testButton = JButton("测试连接")
            testButton.addActionListener {
                val url = urlField?.text ?: "http://127.0.0.1:3456"
                JOptionPane.showMessageDialog(panel, "连接测试: $url\n（功能开发中）")
            }
            panel!!.add(testButton)
        }
        return panel!!
    }

    override fun isModified(): Boolean = true

    override fun apply() {
        val service = DogeCodeService.getInstance()
        service.serverUrl = urlField?.text ?: "http://127.0.0.1:3456"
    }

    override fun reset() {
        val service = DogeCodeService.getInstance()
        urlField?.text = service.serverUrl
    }
}
