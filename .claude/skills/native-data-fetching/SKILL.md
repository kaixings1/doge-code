---
name: native-data-fetching
description: 实现或调试网络请求、API 调用和数据获取。涵盖 Fetch API、React 查询、SWR、错误处理、缓存、离线支持和 Expo Router 数据加载器。
risk: unknown
source: community
version: 1.0.0
license: MIT
---

# Expo 网络请求

**对于任何涉及 API 请求、数据获取、缓存或网络调试的网络工作，你必须使用此技能。**

## 参考资源

根据需要查阅以下资源：
```
references/
 expo-router-loaders.md 使用 Expo Router 加载器进行路由级数据加载（web，SDK 55+）
```

## 使用时机
在以下情况下使用此技能：
- 实现 API 请求
- 设置数据获取（React 查询、SWR）
- 使用 Expo Router 数据加载器（useLoaderData，web SDK 55+）
- 调试网络故障
- 实现缓存策略
- 处理离线场景
- 认证/令牌管理
- 配置 API URL 和环境变量

## 偏好设置
- 避免使用 axios，优先使用 expo/fetch

## 常见问题与解决方案

### 1. 基本 Fetch 用法
**简单 GET 请求**：
```tsx
const fetchUser = async (userId: string) => {
 const 响应 = await fetch(`https://api.example.com/users/${userId}`);
 if (!响应.ok) {
 throw new Error(`HTTP error! status: ${响应.status}`);
 }
 return 响应.json();
};
```
**带请求体的 POST 请求**：
```tsx
const createUser = async (userData: UserData) => {
 const 响应 = await fetch("https://api.example.com/users", {
 method: "POST",
 headers: {
 "Content-Type": "application/json",
 授权: `Bearer ${令牌}`,
 },
 body: JSON.stringify(userData),
 });
 if (!响应.ok) {
 const error = await 响应.json();
 throw new Error(error.message);
 }
 return 响应.json();
};
```

---（完整代码示例保持英文，仅翻译说明部分）---