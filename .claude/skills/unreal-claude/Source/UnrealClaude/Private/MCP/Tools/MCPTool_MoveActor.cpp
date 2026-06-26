// Copyright Natali Caggiano. All Rights Reserved.

#include "MCPTool_MoveActor.h"
#include "MCP/MCPParamValidator.h"
#include "UnrealClaudeModule.h"
#include "UnrealClaudeUtils.h"
#include "Editor.h"
#include "Engine/World.h"
#include "GameFramework/Actor.h"
#include "EngineUtils.h"

FMCPToolResult FMCPTool_MoveActor::Execute(const TSharedRef<FJsonObject>& Params)
{
	UWorld* World = nullptr;
	if (auto Error = ValidateEditorContext(World))
	{
		return Error.GetValue();
	}

	FString ActorName;
	TOptional<FMCPToolResult> ParamError;
	if (!ExtractActorName(Params, TEXT("actor_name"), ActorName, ParamError))
	{
		return ParamError.GetValue();
	}

	AActor* Actor = FindActorByNameOrLabel(World, ActorName);
	if (!Actor)
	{
		return ActorNotFoundError(ActorName);
	}

	FVector CurrentLocation = Actor->GetActorLocation();
	FRotator CurrentRotation = Actor->GetActorRotation();
	FVector CurrentScale = Actor->GetActorScale3D();

	bool bRelative = ExtractOptionalBool(Params, TEXT("relative"), false);

	FVector NewLocation = CurrentLocation;
	bool bLocationChanged = ExtractVectorComponents(Params, TEXT("location"), NewLocation, bRelative);
	if (bLocationChanged)
	{
		Actor->SetActorLocation(NewLocation);
	}

	FRotator NewRotation = CurrentRotation;
	bool bRotationChanged = ExtractRotatorComponents(Params, TEXT("rotation"), NewRotation, bRelative);
	if (bRotationChanged)
	{
		Actor->SetActorRotation(NewRotation);
	}

	// Scale uses multiplicative semantics in relative mode (not additive like location/rotation)
	FVector NewScale = CurrentScale;
	bool bScaleChanged = false;
	if (HasVectorParam(Params, TEXT("scale")))
	{
		if (bRelative)
		{
			FVector ScaleMultiplier = ExtractVectorParam(Params, TEXT("scale"), FVector::OneVector);
			NewScale = CurrentScale * ScaleMultiplier;
		}
		else
		{
			ExtractVectorComponents(Params, TEXT("scale"), NewScale, false);
		}
		Actor->SetActorScale3D(NewScale);
		bScaleChanged = true;
	}

	if (!bLocationChanged && !bRotationChanged && !bScaleChanged)
	{
		return FMCPToolResult::Error(TEXT("No transform changes specified. Provide location, rotation, or scale."));
	}

	Actor->MarkPackageDirty();
	MarkWorldDirty(World);

	TSharedPtr<FJsonObject> ResultData = MakeShared<FJsonObject>();
	ResultData->SetStringField(TEXT("actor"), Actor->GetName());
	ResultData->SetObjectField(TEXT("location"), UnrealClaudeJsonUtils::VectorToJson(Actor->GetActorLocation()));
	ResultData->SetObjectField(TEXT("rotation"), UnrealClaudeJsonUtils::RotatorToJson(Actor->GetActorRotation()));
	ResultData->SetObjectField(TEXT("scale"), UnrealClaudeJsonUtils::VectorToJson(Actor->GetActorScale3D()));

	TArray<FString> Changes;
	if (bLocationChanged) Changes.Add(TEXT("location"));
	if (bRotationChanged) Changes.Add(TEXT("rotation"));
	if (bScaleChanged) Changes.Add(TEXT("scale"));

	return FMCPToolResult::Success(
		FString::Printf(TEXT("Updated %s for actor '%s'"), *FString::Join(Changes, TEXT(", ")), *Actor->GetName()),
		ResultData
	);
}
