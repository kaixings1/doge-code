// Copyright Natali Caggiano. All Rights Reserved.

#include "MCPTool_SpawnActor.h"
#include "MCP/MCPParamValidator.h"
#include "UnrealClaudeModule.h"
#include "UnrealClaudeUtils.h"
#include "Editor.h"
#include "Engine/World.h"
#include "GameFramework/Actor.h"
#include "UObject/UObjectGlobals.h"
#include "Engine/Blueprint.h"
#include "Kismet/GameplayStatics.h"

FMCPToolResult FMCPTool_SpawnActor::Execute(const TSharedRef<FJsonObject>& Params)
{
	UWorld* World = nullptr;
	if (auto Error = ValidateEditorContext(World))
	{
		return Error.GetValue();
	}

	FString ClassPath;
	TOptional<FMCPToolResult> ParamError;
	if (!ExtractRequiredString(Params, TEXT("class"), ClassPath, ParamError))
	{
		return ParamError.GetValue();
	}

	FString ValidationError;
	if (!FMCPParamValidator::ValidateClassPath(ClassPath, ValidationError))
	{
		return FMCPToolResult::Error(ValidationError);
	}

	UClass* ActorClass = LoadActorClass(ClassPath, ParamError);
	if (!ActorClass)
	{
		return ParamError.GetValue();
	}

	FVector Location = ExtractVectorParam(Params, TEXT("location"));
	FRotator Rotation = ExtractRotatorParam(Params, TEXT("rotation"));
	FVector Scale = ExtractScaleParam(Params, TEXT("scale"));

	// Accept actor_name as alias for name — every other actor tool (move_actor,
	// set_property, delete_actors) uses actor_name, so LLMs naturally reach for it.
	TArray<FString> Warnings;
	FString ActorName = ExtractOptionalString(Params, TEXT("name"));
	FString ActorNameAlias;
	const bool bAliasPresent = ActorName.IsEmpty()
		&& Params->TryGetStringField(TEXT("actor_name"), ActorNameAlias)
		&& !ActorNameAlias.IsEmpty();
	if (bAliasPresent)
	{
		ActorName = ActorNameAlias;
		Warnings.Add(TEXT("Parameter 'actor_name' is not the canonical input for 'spawn_actor' — use 'name'. Treating as alias for this call (other actor tools use 'actor_name'; spawn_actor uses 'name' for historical reasons)."));
	}

	auto WithWarnings = [&Warnings](FMCPToolResult R) -> FMCPToolResult
	{
		R.Warnings = Warnings;
		return R;
	};

	if (!ActorName.IsEmpty())
	{
		if (!FMCPParamValidator::ValidateActorName(ActorName, ValidationError))
		{
			return WithWarnings(FMCPToolResult::Error(ValidationError));
		}
	}

	FActorSpawnParameters SpawnParams;
	if (!ActorName.IsEmpty())
	{
		SpawnParams.Name = FName(*ActorName);
	}
	SpawnParams.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AdjustIfPossibleButAlwaysSpawn;

	FTransform SpawnTransform(Rotation, Location, Scale);

	AActor* SpawnedActor = World->SpawnActor<AActor>(ActorClass, SpawnTransform, SpawnParams);

	if (!SpawnedActor)
	{
		return WithWarnings(FMCPToolResult::Error(FString::Printf(TEXT("Failed to spawn actor of class: %s"), *ClassPath)));
	}

	MarkWorldDirty(World);

	TSharedPtr<FJsonObject> ResultData = MakeShared<FJsonObject>();
	ResultData->SetStringField(TEXT("actorName"), SpawnedActor->GetName());
	ResultData->SetStringField(TEXT("actorClass"), ActorClass->GetName());
	ResultData->SetStringField(TEXT("actorLabel"), SpawnedActor->GetActorLabel());
	ResultData->SetObjectField(TEXT("location"), UnrealClaudeJsonUtils::VectorToJson(Location));

	return WithWarnings(FMCPToolResult::Success(
		FString::Printf(TEXT("Spawned actor '%s' of class '%s'"), *SpawnedActor->GetName(), *ActorClass->GetName()),
		ResultData
	));
}
