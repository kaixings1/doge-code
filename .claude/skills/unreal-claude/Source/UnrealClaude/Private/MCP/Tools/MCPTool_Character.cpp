// Copyright Natali Caggiano. All Rights Reserved.

#include "MCPTool_Character.h"
#include "GameFramework/Character.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "Components/SkeletalMeshComponent.h"
#include "Components/CapsuleComponent.h"
#include "Animation/AnimInstance.h"
#include "Animation/AnimBlueprint.h"
#include "Animation/AnimBlueprintGeneratedClass.h"
#include "Engine/Blueprint.h"
#include "Engine/SkeletalMesh.h"
#include "Engine/World.h"
#include "EngineUtils.h"
#include "Kismet2/BlueprintEditorUtils.h"
#include "Kismet2/KismetEditorUtilities.h"

FMCPToolResult FMCPTool_Character::Execute(const TSharedRef<FJsonObject>& Params)
{
	FString Operation;
	TOptional<FMCPToolResult> Error;
	if (!ExtractRequiredString(Params, TEXT("operation"), Operation, Error))
	{
		return Error.GetValue();
	}

	if (Operation == TEXT("list_characters"))
	{
		return ExecuteListCharacters(Params);
	}
	else if (Operation == TEXT("get_character_info"))
	{
		return ExecuteGetCharacterInfo(Params);
	}
	else if (Operation == TEXT("get_movement_params"))
	{
		return ExecuteGetMovementParams(Params);
	}
	else if (Operation == TEXT("set_movement_params"))
	{
		return ExecuteSetMovementParams(Params);
	}
	else if (Operation == TEXT("get_components"))
	{
		return ExecuteGetComponents(Params);
	}
	else if (Operation == TEXT("get_character_config"))
	{
		return ExecuteGetCharacterConfig(Params);
	}
	else if (Operation == TEXT("assign_anim_bp"))
	{
		return ExecuteAssignAnimBP(Params);
	}

	return FMCPToolResult::Error(FString::Printf(
		TEXT("Unknown operation: '%s'. Valid: list_characters, get_character_info, get_movement_params, set_movement_params, get_components, get_character_config, assign_anim_bp"),
		*Operation));
}

FMCPToolResult FMCPTool_Character::ExecuteListCharacters(const TSharedRef<FJsonObject>& Params)
{
	UWorld* World;
	TOptional<FMCPToolResult> Error;
	if (ValidateEditorContext(World).IsSet())
	{
		return ValidateEditorContext(World).GetValue();
	}

	FString ClassFilter = ExtractOptionalString(Params, TEXT("class_filter"));
	int32 Limit = FMath::Clamp(ExtractOptionalNumber<int32>(Params, TEXT("limit"), 100), 1, 1000);
	int32 Offset = FMath::Max(0, ExtractOptionalNumber<int32>(Params, TEXT("offset"), 0));

	TArray<TSharedPtr<FJsonValue>> CharacterArray;
	int32 TotalCount = 0;
	int32 SkippedCount = 0;

	for (TActorIterator<ACharacter> It(World); It; ++It)
	{
		ACharacter* Character = *It;
		if (!IsValid(Character))
		{
			continue;
		}

		if (!ClassFilter.IsEmpty())
		{
			FString ClassName = Character->GetClass()->GetName();
			if (!ClassName.Contains(ClassFilter))
			{
				continue;
			}
		}

		TotalCount++;

		if (SkippedCount < Offset)
		{
			SkippedCount++;
			continue;
		}

		if (CharacterArray.Num() >= Limit)
		{
			continue; // Keep iterating to compute TotalCount accurately for pagination metadata
		}

		CharacterArray.Add(MakeShared<FJsonValueObject>(CharacterToJson(Character)));
	}

	TSharedPtr<FJsonObject> ResultData = MakeShared<FJsonObject>();
	ResultData->SetArrayField(TEXT("characters"), CharacterArray);
	ResultData->SetNumberField(TEXT("count"), CharacterArray.Num());
	// 'total_found' is the canonical pagination field across the plugin (matches
	// list_actions/list_contexts/asset_search). 'total' kept as deprecated alias for back-compat.
	ResultData->SetNumberField(TEXT("total_found"), TotalCount);
	ResultData->SetNumberField(TEXT("total"), TotalCount);
	ResultData->SetNumberField(TEXT("offset"), Offset);
	ResultData->SetNumberField(TEXT("limit"), Limit);

	return FMCPToolResult::Success(
		FString::Printf(TEXT("Found %d characters (showing %d-%d of %d)"),
			TotalCount, Offset + 1, Offset + CharacterArray.Num(), TotalCount),
		ResultData);
}

FMCPToolResult FMCPTool_Character::ExecuteGetCharacterInfo(const TSharedRef<FJsonObject>& Params)
{
	UWorld* World;
	TOptional<FMCPToolResult> Error;
	if (ValidateEditorContext(World).IsSet())
	{
		return ValidateEditorContext(World).GetValue();
	}

	FString CharacterName;
	if (!ExtractActorName(Params, TEXT("character_name"), CharacterName, Error))
	{
		return Error.GetValue();
	}

	FString FindError;
	ACharacter* Character = FindCharacterByName(World, CharacterName, FindError);
	if (!Character)
	{
		return FMCPToolResult::Error(FindError);
	}

	TSharedPtr<FJsonObject> CharacterData = CharacterToJson(Character, true);

	if (USkeletalMeshComponent* MeshComp = Character->GetMesh())
	{
		TSharedPtr<FJsonObject> MeshInfo = MakeShared<FJsonObject>();
		if (MeshComp->GetSkeletalMeshAsset())
		{
			MeshInfo->SetStringField(TEXT("asset"), MeshComp->GetSkeletalMeshAsset()->GetPathName());
		}
		MeshInfo->SetBoolField(TEXT("visible"), MeshComp->IsVisible());
		MeshInfo->SetNumberField(TEXT("num_bones"), MeshComp->GetNumBones());
		CharacterData->SetObjectField(TEXT("skeletal_mesh"), MeshInfo);
	}

	if (UCapsuleComponent* Capsule = Character->GetCapsuleComponent())
	{
		TSharedPtr<FJsonObject> CapsuleInfo = MakeShared<FJsonObject>();
		CapsuleInfo->SetNumberField(TEXT("radius"), Capsule->GetScaledCapsuleRadius());
		CapsuleInfo->SetNumberField(TEXT("half_height"), Capsule->GetScaledCapsuleHalfHeight());
		CharacterData->SetObjectField(TEXT("capsule"), CapsuleInfo);
	}

	if (USkeletalMeshComponent* MeshComp = Character->GetMesh())
	{
		if (UAnimInstance* AnimInstance = MeshComp->GetAnimInstance())
		{
			TSharedPtr<FJsonObject> AnimInfo = MakeShared<FJsonObject>();
			AnimInfo->SetStringField(TEXT("class"), AnimInstance->GetClass()->GetPathName());
			CharacterData->SetObjectField(TEXT("anim_instance"), AnimInfo);
		}
		if (MeshComp->AnimClass)
		{
			CharacterData->SetStringField(TEXT("anim_blueprint"), MeshComp->AnimClass->GetPathName());
		}
	}

	return FMCPToolResult::Success(
		FString::Printf(TEXT("Retrieved info for character: %s"), *CharacterName),
		CharacterData);
}

FMCPToolResult FMCPTool_Character::ExecuteGetMovementParams(const TSharedRef<FJsonObject>& Params)
{
	UWorld* World;
	TOptional<FMCPToolResult> Error;
	if (ValidateEditorContext(World).IsSet())
	{
		return ValidateEditorContext(World).GetValue();
	}

	FString CharacterName;
	if (!ExtractActorName(Params, TEXT("character_name"), CharacterName, Error))
	{
		return Error.GetValue();
	}

	FString FindError;
	ACharacter* Character = FindCharacterByName(World, CharacterName, FindError);
	if (!Character)
	{
		return FMCPToolResult::Error(FindError);
	}

	UCharacterMovementComponent* Movement = Character->GetCharacterMovement();
	if (!Movement)
	{
		return FMCPToolResult::Error(TEXT("Character has no CharacterMovementComponent"));
	}

	TSharedPtr<FJsonObject> ResultData = MakeShared<FJsonObject>();
	ResultData->SetStringField(TEXT("character_name"), CharacterName);
	ResultData->SetObjectField(TEXT("movement"), MovementComponentToJson(Movement));

	return FMCPToolResult::Success(
		FString::Printf(TEXT("Retrieved movement params for: %s"), *CharacterName),
		ResultData);
}

FMCPToolResult FMCPTool_Character::ExecuteSetMovementParams(const TSharedRef<FJsonObject>& Params)
{
	UWorld* World;
	TOptional<FMCPToolResult> Error;
	if (ValidateEditorContext(World).IsSet())
	{
		return ValidateEditorContext(World).GetValue();
	}

	FString CharacterName;
	if (!ExtractActorName(Params, TEXT("character_name"), CharacterName, Error))
	{
		return Error.GetValue();
	}

	FString FindError;
	ACharacter* Character = FindCharacterByName(World, CharacterName, FindError);
	if (!Character)
	{
		return FMCPToolResult::Error(FindError);
	}

	UCharacterMovementComponent* Movement = Character->GetCharacterMovement();
	if (!Movement)
	{
		return FMCPToolResult::Error(TEXT("Character has no CharacterMovementComponent"));
	}

	TArray<FString> ModifiedParams;

	double Value;

	if (Params->TryGetNumberField(TEXT("max_walk_speed"), Value))
	{
		Movement->MaxWalkSpeed = static_cast<float>(FMath::Clamp(Value, 0.0, 10000.0));
		ModifiedParams.Add(TEXT("max_walk_speed"));
	}

	if (Params->TryGetNumberField(TEXT("max_acceleration"), Value))
	{
		Movement->MaxAcceleration = static_cast<float>(FMath::Clamp(Value, 0.0, 100000.0));
		ModifiedParams.Add(TEXT("max_acceleration"));
	}

	if (Params->TryGetNumberField(TEXT("ground_friction"), Value))
	{
		Movement->GroundFriction = static_cast<float>(FMath::Clamp(Value, 0.0, 100.0));
		ModifiedParams.Add(TEXT("ground_friction"));
	}

	if (Params->TryGetNumberField(TEXT("jump_z_velocity"), Value))
	{
		Movement->JumpZVelocity = static_cast<float>(FMath::Clamp(Value, 0.0, 10000.0));
		ModifiedParams.Add(TEXT("jump_z_velocity"));
	}

	if (Params->TryGetNumberField(TEXT("air_control"), Value))
	{
		Movement->AirControl = static_cast<float>(FMath::Clamp(Value, 0.0, 1.0));
		ModifiedParams.Add(TEXT("air_control"));
	}

	if (Params->TryGetNumberField(TEXT("gravity_scale"), Value))
	{
		Movement->GravityScale = static_cast<float>(FMath::Clamp(Value, -10.0, 10.0));
		ModifiedParams.Add(TEXT("gravity_scale"));
	}

	if (Params->TryGetNumberField(TEXT("max_step_height"), Value))
	{
		Movement->MaxStepHeight = static_cast<float>(FMath::Clamp(Value, 0.0, 500.0));
		ModifiedParams.Add(TEXT("max_step_height"));
	}

	if (Params->TryGetNumberField(TEXT("walkable_floor_angle"), Value))
	{
		Movement->SetWalkableFloorAngle(static_cast<float>(FMath::Clamp(Value, 0.0, 90.0)));
		ModifiedParams.Add(TEXT("walkable_floor_angle"));
	}

	if (Params->TryGetNumberField(TEXT("braking_deceleration_walking"), Value))
	{
		Movement->BrakingDecelerationWalking = static_cast<float>(FMath::Clamp(Value, 0.0, 100000.0));
		ModifiedParams.Add(TEXT("braking_deceleration_walking"));
	}

	if (Params->TryGetNumberField(TEXT("braking_friction"), Value))
	{
		Movement->BrakingFriction = static_cast<float>(FMath::Clamp(Value, 0.0, 100.0));
		ModifiedParams.Add(TEXT("braking_friction"));
	}

	if (ModifiedParams.Num() == 0)
	{
		return FMCPToolResult::Error(TEXT("No movement parameters specified to modify"));
	}

	MarkActorDirty(Character);

	TSharedPtr<FJsonObject> ResultData = MakeShared<FJsonObject>();
	ResultData->SetStringField(TEXT("character_name"), CharacterName);
	ResultData->SetArrayField(TEXT("modified_params"), StringArrayToJsonArray(ModifiedParams));
	ResultData->SetObjectField(TEXT("movement"), MovementComponentToJson(Movement));

	return FMCPToolResult::Success(
		FString::Printf(TEXT("Modified %d movement params on: %s"), ModifiedParams.Num(), *CharacterName),
		ResultData);
}

FMCPToolResult FMCPTool_Character::ExecuteGetComponents(const TSharedRef<FJsonObject>& Params)
{
	UWorld* World;
	TOptional<FMCPToolResult> Error;
	if (ValidateEditorContext(World).IsSet())
	{
		return ValidateEditorContext(World).GetValue();
	}

	FString CharacterName;
	if (!ExtractActorName(Params, TEXT("character_name"), CharacterName, Error))
	{
		return Error.GetValue();
	}

	FString ComponentClassFilter = ExtractOptionalString(Params, TEXT("component_class"));

	FString FindError;
	ACharacter* Character = FindCharacterByName(World, CharacterName, FindError);
	if (!Character)
	{
		return FMCPToolResult::Error(FindError);
	}

	TArray<TSharedPtr<FJsonValue>> ComponentArray;
	TArray<UActorComponent*> Components;
	Character->GetComponents(Components);

	for (UActorComponent* Component : Components)
	{
		if (!IsValid(Component))
		{
			continue;
		}

		if (!ComponentClassFilter.IsEmpty())
		{
			FString ClassName = Component->GetClass()->GetName();
			if (!ClassName.Contains(ComponentClassFilter))
			{
				continue;
			}
		}

		ComponentArray.Add(MakeShared<FJsonValueObject>(ComponentToJson(Component)));
	}

	TSharedPtr<FJsonObject> ResultData = MakeShared<FJsonObject>();
	ResultData->SetStringField(TEXT("character_name"), CharacterName);
	ResultData->SetArrayField(TEXT("components"), ComponentArray);
	ResultData->SetNumberField(TEXT("count"), ComponentArray.Num());

	return FMCPToolResult::Success(
		FString::Printf(TEXT("Found %d components on: %s"), ComponentArray.Num(), *CharacterName),
		ResultData);
}

ACharacter* FMCPTool_Character::FindCharacterByName(UWorld* World, const FString& NameOrLabel, FString& OutError)
{
	if (!World)
	{
		OutError = TEXT("No world context available");
		return nullptr;
	}

	for (TActorIterator<ACharacter> It(World); It; ++It)
	{
		ACharacter* Character = *It;
		if (IsValid(Character))
		{
			if (Character->GetName() == NameOrLabel || Character->GetActorLabel() == NameOrLabel)
			{
				return Character;
			}
		}
	}

	OutError = FString::Printf(TEXT("Character not found: %s"), *NameOrLabel);
	return nullptr;
}

TSharedPtr<FJsonObject> FMCPTool_Character::CharacterToJson(ACharacter* Character, bool bIncludeMovement)
{
	TSharedPtr<FJsonObject> Json = MakeShared<FJsonObject>();

	if (!Character)
	{
		return Json;
	}

	Json->SetStringField(TEXT("name"), Character->GetName());
	Json->SetStringField(TEXT("label"), Character->GetActorLabel());
	Json->SetStringField(TEXT("class"), Character->GetClass()->GetName());
	Json->SetStringField(TEXT("class_path"), Character->GetClass()->GetPathName());

	Json->SetObjectField(TEXT("location"), UnrealClaudeJsonUtils::VectorToJson(Character->GetActorLocation()));
	Json->SetObjectField(TEXT("rotation"), UnrealClaudeJsonUtils::RotatorToJson(Character->GetActorRotation()));

	Json->SetBoolField(TEXT("can_jump"), Character->CanJump());
	Json->SetBoolField(TEXT("is_crouched"), Character->bIsCrouched);

	if (bIncludeMovement && Character->GetCharacterMovement())
	{
		Json->SetObjectField(TEXT("movement"), MovementComponentToJson(Character->GetCharacterMovement()));
	}

	return Json;
}

TSharedPtr<FJsonObject> FMCPTool_Character::MovementComponentToJson(UCharacterMovementComponent* Movement)
{
	TSharedPtr<FJsonObject> Json = MakeShared<FJsonObject>();

	if (!Movement)
	{
		return Json;
	}

	Json->SetNumberField(TEXT("max_walk_speed"), Movement->MaxWalkSpeed);
	Json->SetNumberField(TEXT("max_walk_speed_crouched"), Movement->MaxWalkSpeedCrouched);
	Json->SetNumberField(TEXT("max_acceleration"), Movement->MaxAcceleration);
	Json->SetNumberField(TEXT("ground_friction"), Movement->GroundFriction);

	Json->SetNumberField(TEXT("jump_z_velocity"), Movement->JumpZVelocity);
	Json->SetNumberField(TEXT("air_control"), Movement->AirControl);
	Json->SetNumberField(TEXT("air_control_boost_multiplier"), Movement->AirControlBoostMultiplier);
	Json->SetNumberField(TEXT("gravity_scale"), Movement->GravityScale);

	Json->SetNumberField(TEXT("max_step_height"), Movement->MaxStepHeight);
	Json->SetNumberField(TEXT("walkable_floor_angle"), Movement->GetWalkableFloorAngle());
	Json->SetNumberField(TEXT("walkable_floor_z"), Movement->GetWalkableFloorZ());

	Json->SetNumberField(TEXT("braking_deceleration_walking"), Movement->BrakingDecelerationWalking);
	Json->SetNumberField(TEXT("braking_deceleration_falling"), Movement->BrakingDecelerationFalling);
	Json->SetNumberField(TEXT("braking_friction"), Movement->BrakingFriction);
	Json->SetBoolField(TEXT("use_separate_braking_friction"), Movement->bUseSeparateBrakingFriction);

	Json->SetNumberField(TEXT("max_swim_speed"), Movement->MaxSwimSpeed);
	Json->SetNumberField(TEXT("max_fly_speed"), Movement->MaxFlySpeed);

	FString MovementModeStr;
	switch (Movement->MovementMode)
	{
	case MOVE_Walking: MovementModeStr = TEXT("Walking"); break;
	case MOVE_Falling: MovementModeStr = TEXT("Falling"); break;
	case MOVE_Swimming: MovementModeStr = TEXT("Swimming"); break;
	case MOVE_Flying: MovementModeStr = TEXT("Flying"); break;
	case MOVE_Custom: MovementModeStr = TEXT("Custom"); break;
	default: MovementModeStr = TEXT("None"); break;
	}
	Json->SetStringField(TEXT("movement_mode"), MovementModeStr);
	Json->SetObjectField(TEXT("velocity"), UnrealClaudeJsonUtils::VectorToJson(Movement->Velocity));
	Json->SetBoolField(TEXT("is_moving_on_ground"), Movement->IsMovingOnGround());
	Json->SetBoolField(TEXT("is_falling"), Movement->IsFalling());

	return Json;
}

TSharedPtr<FJsonObject> FMCPTool_Character::ComponentToJson(UActorComponent* Component)
{
	TSharedPtr<FJsonObject> Json = MakeShared<FJsonObject>();

	if (!Component)
	{
		return Json;
	}

	Json->SetStringField(TEXT("name"), Component->GetName());
	Json->SetStringField(TEXT("class"), Component->GetClass()->GetName());
	Json->SetBoolField(TEXT("active"), Component->IsActive());

	if (USceneComponent* SceneComp = Cast<USceneComponent>(Component))
	{
		Json->SetBoolField(TEXT("visible"), SceneComp->IsVisible());
		Json->SetObjectField(TEXT("relative_location"), UnrealClaudeJsonUtils::VectorToJson(SceneComp->GetRelativeLocation()));
		Json->SetObjectField(TEXT("relative_rotation"), UnrealClaudeJsonUtils::RotatorToJson(SceneComp->GetRelativeRotation()));

		if (USceneComponent* Parent = SceneComp->GetAttachParent())
		{
			Json->SetStringField(TEXT("attach_parent"), Parent->GetName());
		}
	}

	return Json;
}

namespace
{
	// Resolve a Character Blueprint asset path to (UBlueprint*, ACharacter* CDO).
	// Returns an error result on failure.
	TOptional<FMCPToolResult> LoadCharacterBlueprint(
		const FString& BlueprintPath,
		UBlueprint*& OutBlueprint,
		ACharacter*& OutCDO)
	{
		OutBlueprint = LoadObject<UBlueprint>(nullptr, *BlueprintPath);
		if (!OutBlueprint)
		{
			return FMCPToolResult::Error(FString::Printf(TEXT("Failed to load Blueprint: %s"), *BlueprintPath));
		}
		if (!OutBlueprint->GeneratedClass)
		{
			return FMCPToolResult::Error(FString::Printf(TEXT("Blueprint has no GeneratedClass (recompile may be needed): %s"), *BlueprintPath));
		}
		if (!OutBlueprint->GeneratedClass->IsChildOf(ACharacter::StaticClass()))
		{
			return FMCPToolResult::Error(FString::Printf(
				TEXT("Blueprint is not an ACharacter subclass: %s (parent: %s)"),
				*BlueprintPath, *OutBlueprint->GeneratedClass->GetName()));
		}
		OutCDO = Cast<ACharacter>(OutBlueprint->GeneratedClass->GetDefaultObject());
		if (!OutCDO)
		{
			return FMCPToolResult::Error(FString::Printf(TEXT("Could not get Character CDO for: %s"), *BlueprintPath));
		}
		return TOptional<FMCPToolResult>();
	}
}

FMCPToolResult FMCPTool_Character::ExecuteGetCharacterConfig(const TSharedRef<FJsonObject>& Params)
{
	FString BlueprintPath;
	TOptional<FMCPToolResult> Error;
	if (!ExtractRequiredString(Params, TEXT("blueprint_path"), BlueprintPath, Error))
	{
		return Error.GetValue();
	}
	if (!ValidateBlueprintPathParam(BlueprintPath, Error))
	{
		return Error.GetValue();
	}

	UBlueprint* BP = nullptr;
	ACharacter* CDO = nullptr;
	if (auto LoadError = LoadCharacterBlueprint(BlueprintPath, BP, CDO))
	{
		return LoadError.GetValue();
	}

	TSharedPtr<FJsonObject> Result = MakeShared<FJsonObject>();
	Result->SetBoolField(TEXT("success"), true);
	Result->SetStringField(TEXT("blueprint_path"), BlueprintPath);
	Result->SetStringField(TEXT("class_name"), BP->GeneratedClass->GetName());
	Result->SetStringField(TEXT("parent_class"), BP->GeneratedClass->GetSuperClass()
		? BP->GeneratedClass->GetSuperClass()->GetName() : TEXT(""));

	if (USkeletalMeshComponent* Mesh = CDO->GetMesh())
	{
		TSharedPtr<FJsonObject> MeshJson = MakeShared<FJsonObject>();
		USkeletalMesh* SkelMesh = Mesh->GetSkeletalMeshAsset();
		MeshJson->SetStringField(TEXT("skeletal_mesh_path"),
			SkelMesh ? SkelMesh->GetPathName() : TEXT(""));
		UClass* AnimClass = Mesh->GetAnimClass();
		MeshJson->SetStringField(TEXT("anim_class_path"),
			AnimClass ? AnimClass->GetPathName() : TEXT(""));
		Result->SetObjectField(TEXT("mesh"), MeshJson);
	}

	if (UCapsuleComponent* Capsule = CDO->GetCapsuleComponent())
	{
		TSharedPtr<FJsonObject> CapsuleJson = MakeShared<FJsonObject>();
		CapsuleJson->SetNumberField(TEXT("radius"), Capsule->GetUnscaledCapsuleRadius());
		CapsuleJson->SetNumberField(TEXT("half_height"), Capsule->GetUnscaledCapsuleHalfHeight());
		Result->SetObjectField(TEXT("capsule"), CapsuleJson);
	}

	if (UCharacterMovementComponent* Movement = CDO->GetCharacterMovement())
	{
		Result->SetObjectField(TEXT("movement_defaults"), MovementComponentToJson(Movement));
	}

	return FMCPToolResult::Success(
		FString::Printf(TEXT("Character config for '%s'"), *BP->GeneratedClass->GetName()),
		Result);
}

FMCPToolResult FMCPTool_Character::ExecuteAssignAnimBP(const TSharedRef<FJsonObject>& Params)
{
	FString BlueprintPath, AnimBlueprintPath;
	TOptional<FMCPToolResult> Error;
	if (!ExtractRequiredString(Params, TEXT("blueprint_path"), BlueprintPath, Error))
	{
		return Error.GetValue();
	}
	if (!ValidateBlueprintPathParam(BlueprintPath, Error))
	{
		return Error.GetValue();
	}
	if (!ExtractRequiredString(Params, TEXT("anim_blueprint_path"), AnimBlueprintPath, Error))
	{
		return Error.GetValue();
	}
	if (!ValidateBlueprintPathParam(AnimBlueprintPath, Error))
	{
		return Error.GetValue();
	}

	UBlueprint* BP = nullptr;
	ACharacter* CDO = nullptr;
	if (auto LoadError = LoadCharacterBlueprint(BlueprintPath, BP, CDO))
	{
		return LoadError.GetValue();
	}

	UAnimBlueprint* AnimBP = LoadObject<UAnimBlueprint>(nullptr, *AnimBlueprintPath);
	if (!AnimBP)
	{
		return FMCPToolResult::Error(FString::Printf(TEXT("Failed to load AnimBlueprint: %s"), *AnimBlueprintPath));
	}
	if (!AnimBP->GeneratedClass || !AnimBP->GeneratedClass->IsChildOf(UAnimInstance::StaticClass()))
	{
		return FMCPToolResult::Error(FString::Printf(TEXT("Asset is not a valid AnimBlueprint: %s"), *AnimBlueprintPath));
	}

	USkeletalMeshComponent* Mesh = CDO->GetMesh();
	if (!Mesh)
	{
		return FMCPToolResult::Error(TEXT("Character CDO has no Mesh component"));
	}

	UClass* NewAnimClass = AnimBP->GeneratedClass;
	Mesh->SetAnimInstanceClass(NewAnimClass);
	Mesh->AnimClass = NewAnimClass;

	FBlueprintEditorUtils::MarkBlueprintAsStructurallyModified(BP);
	FKismetEditorUtilities::CompileBlueprint(BP);

	TSharedPtr<FJsonObject> Result = MakeShared<FJsonObject>();
	Result->SetBoolField(TEXT("success"), true);
	Result->SetStringField(TEXT("blueprint_path"), BlueprintPath);
	Result->SetStringField(TEXT("anim_blueprint_path"), AnimBlueprintPath);
	Result->SetStringField(TEXT("anim_class"), NewAnimClass->GetPathName());

	return FMCPToolResult::Success(
		FString::Printf(TEXT("Assigned AnimBlueprint '%s' to Character '%s'"),
			*AnimBP->GetName(), *BP->GeneratedClass->GetName()),
		Result);
}
