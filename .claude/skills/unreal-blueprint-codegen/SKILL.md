---
name: Unreal Engine 蓝图生成
description: 从C++以编程方式生成Unreal Engine 5.x蓝图和Widget蓝图文件。用于构建市场示例或批量生成蓝图的编辑器工具。
---

# Unreal Engine 蓝图代码生成（UE 5.4–5.7）

在编辑器模块中从 C++ 生成完整的 `.uasset` 文件（蓝图、Widget 蓝图、领域资产）。已验证兼容 UE 5.7。大多数模式可回溯至 5.4。

## 适用场景

用户想**以编程方式编写资产内容**——变量、函数图、事件图连线、Widget 层级、UMG 动画、自定义资产图——而不是通过编辑器点击操作。典型用例：生成市场示例内容（快速入门、教程、演示对话），使其可重复生成，而非手动修剪二进制 `.uasset` 文件。

如果用户只想要运行时 Widget 实例化（游戏时的 `CreateWidget` / `WidgetTree->ConstructWidget`），此技能过于复杂——那只是普通的 UMG。

## 硬性前置条件

- **C++ 编辑器模块**，包含 `Type=Editor`（或 `UncookedOnly`）。Python 无法编写事件图——`UEdGraph`/`UK2Node_*` 未暴露。如果需要一个 Python 入口点，在 C++ 中设置 `UBlueprintFunctionLibrary` 并从 Python 调用其 UFUNCTION。
- 模块必须至少依赖：`UnrealEd`、`BlueprintGraph`、`Kismet`、`KismetCompiler`、`AssetTools`、`AssetRegistry`。如需 Widget 蓝图，添加 `UMG`、`UMGEditor`、`MovieScene`、`MovieSceneTracks`。参见 [assets/experiment-module-template/](assets/experiment-module-template/) 获取可用的 `.Build.cs`。
- IWYU：显式包含每个引擎头文件。在自己的头文件中前向声明 `UPackage`/`UObject` 等；仅在 `.cpp` 中包含完整头文件。

## 30 秒心智模型

```
Asset = UPackage  +  UObject (例如 UBlueprint / UWidgetBlueprint / UMyAsset)
                     |
                     +-- source UEdGraph（仅编辑器，设计师所见）
                     |     +-- UK2Node_* / UEdGraphNode_*（盒子）
                     |           +-- UEdGraphPin（连线）
                     |
                     +-- generated UClass  <- 由 CompileBlueprint 生成
                           +-- FProperty / UFunction（运行时使用的代码）
```

在图上生成编辑器节点，连接它们的引脚，然后调用 `CompileBlueprint` 来烘培生成的类。保存包。

## 决策树

| 目标 | 参考 |