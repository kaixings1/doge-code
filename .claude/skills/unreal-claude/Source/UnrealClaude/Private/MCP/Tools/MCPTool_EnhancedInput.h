// Copyright Natali Caggiano. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "MCP/MCPToolBase.h"

class UInputAction;
class UInputMappingContext;
class UInputTrigger;
class UInputModifier;
struct FEnhancedActionKeyMapping;

/**
 * MCP Tool: Enhanced Input System
 *
 * Create and modify Enhanced Input assets (InputAction, InputMappingContext).
 * Supports triggers, modifiers, and key mappings.
 *
 * Asset Creation:
 *   - create_input_action: Create new UInputAction asset
 *   - create_mapping_context: Create new UInputMappingContext asset
 *
 * Mapping Operations:
 *   - add_mapping: Add key->action mapping to context
 *   - remove_mapping: Remove mapping from context
 *   - add_trigger: Add trigger to existing mapping
 *   - add_modifier: Add modifier to existing mapping
 *
 * Query Operations:
 *   - query_context: List all mappings in a context
 *   - query_action: Get InputAction details
 *   - list_actions: Enumerate InputAction assets under a package path
 *   - list_contexts: Enumerate InputMappingContext assets under a package path
 *   - get_action_info: Find InputAction by name (no path needed) and return details
 *
 * All operations auto-save assets after modification.
 */
class FMCPTool_EnhancedInput : public FMCPToolBase
{
public:
	virtual FMCPToolInfo GetInfo() const override
	{
		FMCPToolInfo Info;
		Info.Name = TEXT("enhanced_input");
		Info.Description = TEXT(
			"Create and modify Enhanced Input assets (InputAction, InputMappingContext).\n\n"
			"Operations:\n"
			"- 'create_input_action': Create new InputAction asset\n"
			"- 'create_mapping_context': Create new InputMappingContext asset\n"
			"- 'add_mapping': Add key binding to mapping context\n"
			"- 'remove_mapping': Remove key binding from context\n"
			"- 'add_trigger': Add trigger (Hold, Tap, etc.) to mapping\n"
			"- 'add_modifier': Add modifier (Negate, Scale, etc.) to mapping\n"
			"- 'query_context': List all mappings in a context\n"
			"- 'query_action': Get InputAction details\n"
			"- 'list_actions': Enumerate InputAction assets under package_path (filters: name_pattern, limit)\n"
			"- 'list_contexts': Enumerate InputMappingContext assets under package_path (filters: name_pattern, limit)\n"
			"- 'get_action_info': Find InputAction by action_name and return its details\n\n"
			"Value Types: 'Digital' (bool), 'Axis1D' (float), 'Axis2D' (Vector2D), 'Axis3D' (Vector)\n\n"
			"Trigger Types: 'Pressed', 'Released', 'Down', 'Hold', 'HoldAndRelease', 'Tap', 'Pulse', 'ChordAction'\n\n"
			"Modifier Types: 'Negate', 'Swizzle', 'Scalar', 'DeadZone'\n\n"
			"Keys: Standard UE key names (SpaceBar, W, A, S, D, LeftMouseButton, Gamepad_FaceButton_Bottom, etc.)\n\n"
			"Default asset path: /Game/Input/ (customizable via package_path)"
		);
		Info.Parameters = {
			FMCPToolParameter(TEXT("operation"), TEXT("string"),
				TEXT("Operation to perform (see description)"), true),

			FMCPToolParameter(TEXT("package_path"), TEXT("string"),
				TEXT("Package path for new assets (default: '/Game/Input')"), false, TEXT("/Game/Input")),

			FMCPToolParameter(TEXT("action_name"), TEXT("string"),
				TEXT("Name for new InputAction asset (e.g., 'IA_Jump')"), false),
			FMCPToolParameter(TEXT("context_name"), TEXT("string"),
				TEXT("Name for new InputMappingContext asset (e.g., 'IMC_Default')"), false),
			FMCPToolParameter(TEXT("value_type"), TEXT("string"),
				TEXT("InputAction value type: 'Digital', 'Axis1D', 'Axis2D', 'Axis3D'"), false, TEXT("Digital")),

			FMCPToolParameter(TEXT("context_path"), TEXT("string"),
				TEXT("Path to InputMappingContext asset"), false),
			FMCPToolParameter(TEXT("action_path"), TEXT("string"),
				TEXT("Path to InputAction asset"), false),

			FMCPToolParameter(TEXT("key"), TEXT("string"),
				TEXT("Key name (e.g., 'SpaceBar', 'W', 'Gamepad_FaceButton_Bottom')"), false),

			FMCPToolParameter(TEXT("trigger_type"), TEXT("string"),
				TEXT("Trigger type: 'Pressed', 'Released', 'Down', 'Hold', 'HoldAndRelease', 'Tap', 'Pulse', 'ChordAction'"), false),
			FMCPToolParameter(TEXT("hold_time"), TEXT("number"),
				TEXT("Hold duration in seconds (for Hold/HoldAndRelease triggers)"), false, TEXT("0.5")),
			FMCPToolParameter(TEXT("tap_release_time"), TEXT("number"),
				TEXT("Max release time for Tap trigger"), false, TEXT("0.2")),
			FMCPToolParameter(TEXT("pulse_interval"), TEXT("number"),
				TEXT("Interval in seconds for Pulse trigger"), false, TEXT("0.1")),
			FMCPToolParameter(TEXT("chord_action_path"), TEXT("string"),
				TEXT("Path to chord InputAction (for ChordAction trigger)"), false),

			FMCPToolParameter(TEXT("modifier_type"), TEXT("string"),
				TEXT("Modifier type: 'Negate', 'Swizzle', 'Scalar', 'DeadZone'"), false),
			FMCPToolParameter(TEXT("swizzle_order"), TEXT("string"),
				TEXT("Axis order for Swizzle: 'YXZ', 'ZYX', 'XZY', 'YZX', 'ZXY'"), false, TEXT("YXZ")),
			FMCPToolParameter(TEXT("scalar"), TEXT("object"),
				TEXT("Scale factors: {x, y, z} for Scalar modifier"), false),
			FMCPToolParameter(TEXT("dead_zone_lower"), TEXT("number"),
				TEXT("Lower threshold for DeadZone (0.0-1.0)"), false, TEXT("0.2")),
			FMCPToolParameter(TEXT("dead_zone_upper"), TEXT("number"),
				TEXT("Upper threshold for DeadZone (0.0-1.0)"), false, TEXT("1.0")),
			FMCPToolParameter(TEXT("dead_zone_type"), TEXT("string"),
				TEXT("DeadZone type: 'Axial', 'Radial'"), false, TEXT("Axial")),

			FMCPToolParameter(TEXT("mapping_index"), TEXT("number"),
				TEXT("Index of mapping to remove (from query_context)"), false),

			FMCPToolParameter(TEXT("name_pattern"), TEXT("string"),
				TEXT("Substring to match in asset names (case-insensitive) for list_actions/list_contexts"), false),
			FMCPToolParameter(TEXT("limit"), TEXT("number"),
				TEXT("Maximum results to return for list_actions/list_contexts (1-1000, default: 50)"), false, TEXT("50"))
		};
		Info.Annotations = FMCPToolAnnotations::Modifying();
		return Info;
	}

	virtual FMCPToolResult Execute(const TSharedRef<FJsonObject>& Params) override;

private:
	FMCPToolResult ExecuteCreateInputAction(const TSharedRef<FJsonObject>& Params);
	FMCPToolResult ExecuteCreateMappingContext(const TSharedRef<FJsonObject>& Params);

	FMCPToolResult ExecuteAddMapping(const TSharedRef<FJsonObject>& Params);
	FMCPToolResult ExecuteRemoveMapping(const TSharedRef<FJsonObject>& Params);
	FMCPToolResult ExecuteAddTrigger(const TSharedRef<FJsonObject>& Params);
	FMCPToolResult ExecuteAddModifier(const TSharedRef<FJsonObject>& Params);

	FMCPToolResult ExecuteQueryContext(const TSharedRef<FJsonObject>& Params);
	FMCPToolResult ExecuteQueryAction(const TSharedRef<FJsonObject>& Params);
	FMCPToolResult ExecuteListActions(const TSharedRef<FJsonObject>& Params);
	FMCPToolResult ExecuteListContexts(const TSharedRef<FJsonObject>& Params);
	FMCPToolResult ExecuteGetActionInfo(const TSharedRef<FJsonObject>& Params);

	UInputAction* LoadInputAction(const FString& Path, FString& OutError);
	UInputMappingContext* LoadMappingContext(const FString& Path, FString& OutError);
	bool SaveAsset(UObject* Asset, FString& OutError);
	FKey ParseKey(const FString& KeyName, FString& OutError);

	UInputTrigger* CreateTrigger(const FString& TriggerType, const TSharedRef<FJsonObject>& Params, FString& OutError);

	UInputModifier* CreateModifier(const FString& ModifierType, const TSharedRef<FJsonObject>& Params, FString& OutError);

	/**
	 * Find mapping index by explicit mapping_index param or by searching for action.
	 * Returns -1 and sets OutError if not found or invalid.
	 */
	int32 FindMappingIndex(
		UInputMappingContext* Context,
		UInputAction* Action,
		const TSharedRef<FJsonObject>& Params,
		FString& OutError);

	TSharedPtr<FJsonObject> InputActionToJson(UInputAction* Action);
	TSharedPtr<FJsonObject> MappingContextToJson(UInputMappingContext* Context);
	TSharedPtr<FJsonObject> MappingToJson(const FEnhancedActionKeyMapping& Mapping, int32 Index);
};
