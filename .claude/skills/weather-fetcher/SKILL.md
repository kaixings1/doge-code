---
name: 天气获取技能
description: 天气获取技能
user-invocable: false
allowed-tools:
  - "WebFetch(*)"
---

# 天气获取技能

此技能提供获取当前天气数据的指令。

## 任务

获取阿联酋迪拜当前温度，使用请求的单位（摄氏度或华氏度）。

## 指令

1. **获取天气数据**：使用 WebFetch 工具从 Open-Meteo API 获取迪拜当前天气数据。

   对于**摄氏度**：
   - URL: `https://api.open-meteo.com/v1/forecast?latitude=25.2048&longitude=55.2708&current=temperature_2m&temperature_unit=celsius`

   对于**华氏度**：
   - URL: `https://api.open-meteo.com/v1/forecast?latitude=25.2048&longitude=55.2708&current=temperature_2m&temperature_unit=fahrenheit`

2. **提取温度**：从 JSON 响应中提取当前温度：
   - 字段: `current.temperature_2m`
   - 单位标签在: `current_units.temperature_2m`

3. **返回结果**：清晰地返回温度值和单位。

## 预期输出

完成此技能指令后：
```
当前迪拜温度：[X]°[C/F]
单位：[摄氏度/华氏度]
```

## 注意事项

- 仅获取温度，不要执行任何转换或写入任何文件
- Open-Meteo 是免费的，无需 API 密钥，使用基于坐标的查询以确保可靠性
- 迪拜坐标：纬度 25.2048，经度 55.2708
- 返回数值型的温度值和单位，表述清晰
- 根据调用者的请求支持摄氏度和华氏度
