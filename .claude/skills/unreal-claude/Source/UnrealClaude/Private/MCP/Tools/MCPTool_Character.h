// Copyright Natali Caggiano. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "MCP/MCPToolBase.h"

class ACharacter;
class UCharacterMovementComponent;

/**
 * MCP Tool: Character Management
 *
 * Query and modify ACharacter actors in the current level.
 * Provides access to movement parameters, skeletal mesh, animation, and components.
 *
 * Query Operations:
 *   - list_characters: Find all ACharacter actors with optional filtering
 *   - get_character_info: Get detailed character info (mesh, anim, transform)
 *   - get_movement_params: Query CharacterMovementComponent properties
 *   - get_components: List all components attached to a character
 *
 * Modify Operations:
 *   - set_movement_params: Modify movement values (speed, jump, friction, etc.)
 *
 * Blueprint (Class-Default) Operations:
 *   - get_character_config: Read defaults from a Character Blueprint CDO (mesh, anim class, capsule, movement)
 *   - assign_anim_bp: Set the Mesh component's AnimClass on a Character Blueprint
 *
 * Level-actor ops use character_name; Blueprint-class ops use blueprint_path.
 */
class FMCPTool_Character : public FMCPToolBase
{
public:
	virtual FMCPToolInfo GetInfo() const override
	{
		FMCPToolInfo Info;
		Info.Name = TEXT("character");
		Info.Description = TEXT(
			"Query and modify ACharacter actors in the current level.\n\n"
			"Operations:\n"
			"- 'list_characters': Find all characters with optional class filter\n"
			"- 'get_character_info': Get mesh, animation, transform details\n"
			"- 'get_movement_params': Query movement component properties\n"
			"- 'set_movement_params': Modify movement values (speeds, jump, friction)\n"
			"- 'get_components': List all components on a character\n\n"
			"Characters are identified by actor name or label.\n\n"
			"Movement properties include:\n"
			"- max_walk_speed, max_acceleration, ground_friction\n"
			"- jump_z_velocity, air_control, gravity_scale\n"
			"- max_step_height, walkable_floor_angle\n"
			"- braking_deceleration_walking, braking_friction\n\n"
			"Blueprint-class operations (use blueprint_path, NOT character_name):\n"
			"- 'get_character_config': Read defaults from a Character Blueprint (mesh, anim class, capsule, movement)\n"
			"- 'assign_anim_bp': Set Mesh AnimClass on a Character Blueprint (params: blueprint_path, anim_blueprint_path)"
		);
		Info.Parameters = {
			FMCPToolParameter(TEXT("operation"), TEXT("string"),
				TEXT("Operation to perform (see description)"), true),

			FMCPToolParameter(TEXT("character_name"), TEXT("string"),
				TEXT("Character actor name or label (required for single-character ops)"), false),

			FMCPToolParameter(TEXT("class_filter"), TEXT("string"),
				TEXT("Filter by character class name (e.g., 'BP_PlayerCharacter')"), false),
			FMCPToolParameter(TEXT("limit"), TEXT("number"),
				TEXT("Max results to return (default: 100)"), false, TEXT("100")),
			FMCPToolParameter(TEXT("offset"), TEXT("number"),
				TEXT("Skip first N results (default: 0)"), false, TEXT("0")),

			FMCPToolParameter(TEXT("max_walk_speed"), TEXT("number"),
				TEXT("Maximum walking speed (cm/s)"), false),
			FMCPToolParameter(TEXT("max_acceleration"), TEXT("number"),
				TEXT("Maximum acceleration (cm/s^2)"), false),
			FMCPToolParameter(TEXT("ground_friction"), TEXT("number"),
				TEXT("Ground friction coefficient"), false),
			FMCPToolParameter(TEXT("jump_z_velocity"), TEXT("number"),
				TEXT("Initial jump velocity (cm/s)"), false),
			FMCPToolParameter(TEXT("air_control"), TEXT("number"),
				TEXT("Air control factor (0.0-1.0)"), false),
			FMCPToolParameter(TEXT("gravity_scale"), TEXT("number"),
				TEXT("Gravity multiplier"), false),
			FMCPToolParameter(TEXT("max_step_height"), TEXT("number"),
				TEXT("Maximum step height (cm)"), false),
			FMCPToolParameter(TEXT("walkable_floor_angle"), TEXT("number"),
				TEXT("Max floor angle for walking (degrees)"), false),
			FMCPToolParameter(TEXT("braking_deceleration_walking"), TEXT("number"),
				TEXT("Braking deceleration when walking (cm/s^2)"), false),
			FMCPToolParameter(TEXT("braking_friction"), TEXT("number"),
				TEXT("Braking friction coefficient"), false),

			FMCPToolParameter(TEXT("component_class"), TEXT("string"),
				TEXT("Filter components by class name"), false),

			FMCPToolParameter(TEXT("blueprint_path"), TEXT("string"),
				TEXT("Path to Character Blueprint asset (for get_character_config / assign_anim_bp)"), false),
			FMCPToolParameter(TEXT("anim_blueprint_path"), TEXT("string"),
				TEXT("Path to AnimBlueprint asset to assign (for assign_anim_bp)"), false)
		};
		// Mixed read-only and modifying ops — annotate as Modifying because set_movement_params writes state
		Info.Annotations = FMCPToolAnnotations::Modifying();
		return Info;
	}

	virtual FMCPToolResult Execute(const TSharedRef<FJsonObject>& Params) override;

private:
	FMCPToolResult ExecuteListCharacters(const TSharedRef<FJsonObject>& Params);
	FMCPToolResult ExecuteGetCharacterInfo(const TSharedRef<FJsonObject>& Params);
	FMCPToolResult ExecuteGetMovementParams(const TSharedRef<FJsonObject>& Params);
	FMCPToolResult ExecuteSetMovementParams(const TSharedRef<FJsonObject>& Params);
	FMCPToolResult ExecuteGetComponents(const TSharedRef<FJsonObject>& Params);
	FMCPToolResult ExecuteGetCharacterConfig(const TSharedRef<FJsonObject>& Params);
	FMCPToolResult ExecuteAssignAnimBP(const TSharedRef<FJsonObject>& Params);

	ACharacter* FindCharacterByName(UWorld* World, const FString& NameOrLabel, FString& OutError);
	TSharedPtr<FJsonObject> CharacterToJson(ACharacter* Character, bool bIncludeMovement = false);
	TSharedPtr<FJsonObject> MovementComponentToJson(UCharacterMovementComponent* Movement);
	TSharedPtr<FJsonObject> ComponentToJson(UActorComponent* Component);
};
