---
name: godot-4-migration
description: "将 Godot 3.x 项目迁移到 Godot 4 (GDScript 2.0) 的专门指南，涵盖语法更改、Tweens 和导出。"
risk: safe
source: community
date_added: "2026-02-27"
---

# Godot 4 迁移指南

## 概述

从 Godot 3.x 迁移到 Godot 4 的关键指南。本技能专注于 GDScript 2.0 的主要语法更改、新的 `Tween` 系统和 `export` 注解更新。

## 使用此技能的场景

- 将 Godot 3 项目移植到 Godot 4 时
- 升级后遇到语法错误时
- 替换已弃用的节点时（如 `Tween` 节点 vs `create_tween`）
- 将 `export` 变量更新为 `@export` 注解时

## 关键更改

### 1. 注解（`@`）

Godot 4 使用 `@` 表示修改行为的关键字。
- `export var x` -> `@export var x`
- `onready var y` -> `@onready var y`
- `tool` -> `@tool`（在文件顶部）

### 2. Setter 和 Getter

属性现在内联定义 setter/getter。

**Godot 3:**
```gdscript
var health setget set_health, get_health

func set_health(value):
    health = value
```

**Godot 4:**
```gdscript
var health: int:
    set(value):
        health = value
        emit_signal("health_changed", health)
    get:
        return health
```

### 3. Tween 系统

`Tween` 节点已弃用。在代码中使用 `create_tween()`。

**Godot 3:**
```gdscript
$Tween.interpolate_property(...)
$Tween.start()
```

**Godot 4:**
```gdscript
var tween = create_tween()
tween.tween_property($Sprite, "position", Vector2(100, 100), 1.0)
tween.parallel().tween_property($Sprite, "modulate:a", 0.0, 1.0)
```

### 4. 信号连接

不鼓励使用基于字符串的连接。使用可调用对象。

**Godot 3:**
```gdscript
connect("pressed", self, "_on_pressed")
```

**Godot 4:**
```gdscript
pressed.connect(_on_pressed)
```

## 示例

### 示例 1：类型化数组

GDScript 2.0 支持类型化数组以提高性能和类型安全。

```gdscript
# Godot 3
var enemies = []

# Godot 4
var enemies: Array[Node] = []

func _ready():
    for child in get_children():
        if child is Enemy:
            enemies.append(child)
```

### 示例 2：等待信号（协程）

`yield` 被 `await` 替换。

**Godot 3:**
```gdscript
yield(get_tree().create_timer(1.0), "timeout")
```

**Godot 4:**
```gdscript
await get_tree().create_timer(1.0).timeout
```

## 最佳实践

- ✅ **建议：** 使用 `@export_range`、`@export_file` 等以获取更好的检查器 UI
- ✅ **建议：** 为所有变量添加类型（`var x: int`）以在 GDScript 2.0 中获得性能提升
- ✅ **建议：** 使用 `super()` 调用父方法，而不是 `.function_name()`
- ❌ **不要：** 如果可以使用信号对象（`name.emit()`），就不要使用字符串名称的信号（`emit_signal("name")`）

## 故障排除

**问题：** "Identifier 'Tween' is not a valid type."
**解决方案：** `Tween` 现在是 `SceneTreeTween` 或只是 `create_tween()` 返回的对象。您很少需要显式指定其类型，只需使用 `var tween = create_tween()`。

## 限制
- 仅当任务明确符合上述范围时使用此技能
- 不要将输出视为环境特定验证、测试或专家评审的替代品
- 如果缺少必需的输入、权限、安全边界或成功标准，请停止并请求澄清
