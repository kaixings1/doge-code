package com.doge.code

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.Service

/**
 * Doge Code 应用服务
 * 管理插件的全局状态
 */
@Service
class DogeCodeService {
    var serverUrl: String = "http://127.0.0.1:3456"
    var isConnected: Boolean = false

    companion object {
        fun getInstance(): DogeCodeService {
            return ApplicationManager.getApplication().getService(DogeCodeService::class.java)
        }
    }

    fun checkConnection(): Boolean {
        return try {
            val url = java.URL("$serverUrl/api/health")
            val connection = url.openConnection() as java.net.HttpURLConnection
            connection.requestMethod = "GET"
            connection.connectTimeout = 3000
            val code = connection.responseCode
            connection.disconnect()
            isConnected = code == 200
            isConnected
        } catch (e: Exception) {
            isConnected = false
            false
        }
    }

    fun getStats(): Map<String, Any>? {
        return try {
            val url = java.URL("$serverUrl/api/stats")
            val connection = url.openConnection() as java.net.HttpURLConnection
            connection.requestMethod = "GET"
            connection.connectTimeout = 5000
            val reader = connection.inputStream.bufferedReader()
            val response = reader.readText()
            reader.close()
            connection.disconnect()
            // 简单解析 JSON
            mutableMapOf<String, Any>("raw" to response)
        } catch (e: Exception) {
            null
        }
    }
}
