---
name: phone-automation-agent
description: Open-AutoGLM 手机自动化代理 — 通过 AI 控制 Android/iOS 设备
---

# 手机自动化代理

基于智谱清言 Open-AutoGLM 开源框架的手机自动化代理。

## 核心能力
- 通过 ADB（Android）/ XCTest（iOS）控制手机
- 屏幕 UI 识别与元素定位
- 自动化点击/滑动/输入操作
- 应用启动与管理

## 工作原理
1. 接收自然语言指令
2. 解析为设备操作序列
3. 通过 ADB/XCTest 执行操作
4. 获取屏幕反馈并循环验证

## 参考
智谱清言 Open-AutoGLM: https://github.com/zai-org/Open-AutoGLM