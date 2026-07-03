---
name: unreal-blueprint-codegen
description: 从C++以编程方式生成Unreal Engine 5.x蓝图和Widget蓝图文件。用于构建市场示例或批量生成蓝图的编辑器工具。
---

# Unreal Engine Blueprint Code Generation (UE 5.4–5.7)

Generate complete `.uasset` files (Blueprints, Widget Blueprints, domain assets) from C++ in an editor module. Validated against UE 5.7. Most patterns work back to 5.4.

## When this skill applies

User wants to **author asset content programmatically** — variables, function graphs, event-graph wiring, widget hierarchies, UMG animations, custom asset graphs — instead of clicking through the editor. Typical use case: generating Marketplace sample content (Quick-Start, walkthrough, demo conversations) so it can be regenerated reproducibly instead of hand-pruning binary `.uasset` files.

If the user only wants runtime widget instantiation (`CreateWidget` / `WidgetTree->ConstructWidget` at game time), this skill is overkill — that's just normal UMG.

## Hard prerequisites

- **C++ editor module** with `Type=Editor` (or `UncookedOnly`). Python cannot author event graphs — `UEdGraph`/`UK2Node_*` are not exposed. Set up a `UBlueprintFunctionLibrary` in C++ and call its UFUNCTIONs from Python if a Python entry point is needed.
- Module must depend on at least: `UnrealEd`, `BlueprintGraph`, `Kismet`, `KismetCompiler`, `AssetTools`, `AssetRegistry`. Add `UMG`, `UMGEditor`, `MovieScene`, `MovieSceneTracks` for Widget Blueprints. See [assets/experiment-module-template/](assets/experiment-module-template/) for a working `.Build.cs`.
- IWYU: include each engine header explicitly. Forward-declare `UPackage`/`UObject` etc. in your own headers; pull full headers in `.cpp` only.

## The 30-second mental model

```
Asset = UPackage  +  UObject (e.g. UBlueprint / UWidgetBlueprint / UMyAsset)
                     |
                     +-- source UEdGraph (editor-only, what designers see)
                     |     +-- UK2Node_* / UEdGraphNode_* (the boxes)
                     |           +-- UEdGraphPin (the wires)
                     |
                     +-- generated UClass  <- produced by CompileBlueprint
                           +-- FProperty / UFunction (what code uses at runtime)
```

Spawn editor nodes onto a graph, wire their pins, then call `CompileBlueprint` to bake the generated class. Save the package.

## Decision tree

| Goal | Read |
|---MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY. NEXT AVAILABLE IN  20 HOURS 42 MINUTES 51 SECONDS VISIT HTTPS://MYMEMORY.TRANSLATED.NET/DOC/USAGELIMITS.PHP TO TRANSLATE MORE