// Copyright Natali Caggiano. All Rights Reserved.

#include "MCPTool_DeleteActors.h"
#include "MCP/MCPParamValidator.h"
#include "UnrealClaudeModule.h"
#include "Editor.h"
#include "Engine/World.h"
#include "GameFramework/Actor.h"
#include "EngineUtils.h"

FMCPToolResult FMCPTool_DeleteActors::Execute(const TSharedRef<FJsonObject>& Params)
{
	UWorld* World = nullptr;
	if (auto Error = ValidateEditorContext(World))
	{
		return Error.GetValue();
	}

	TArray<AActor*> ActorsToDelete;
	TArray<FString> DeletedNames;
	TArray<FString> NotFoundNames;
	FString ValidationError;

	FString SingleActorName;
	if (Params->TryGetStringField(TEXT("actor_name"), SingleActorName))
	{
		if (!FMCPParamValidator::ValidateActorName(SingleActorName, ValidationError))
		{
			return FMCPToolResult::Error(ValidationError);
		}

		if (AActor* Actor = FindActorByNameOrLabel(World, SingleActorName))
		{
			ActorsToDelete.Add(Actor);
			DeletedNames.Add(Actor->GetName());
		}
		else
		{
			NotFoundNames.Add(SingleActorName);
		}
	}

	const TArray<TSharedPtr<FJsonValue>>* ActorNamesArray;
	if (Params->TryGetArrayField(TEXT("actor_names"), ActorNamesArray))
	{
		for (const TSharedPtr<FJsonValue>& NameValue : *ActorNamesArray)
		{
			FString ActorName;
			if (NameValue->TryGetString(ActorName))
			{
				if (!FMCPParamValidator::ValidateActorName(ActorName, ValidationError))
				{
					return FMCPToolResult::Error(ValidationError);
				}

				if (AActor* Actor = FindActorByNameOrLabel(World, ActorName))
				{
					ActorsToDelete.AddUnique(Actor);
					DeletedNames.AddUnique(Actor->GetName());
				}
				else
				{
					NotFoundNames.Add(ActorName);
				}
			}
		}
	}

	FString ClassFilter;
	if (Params->TryGetStringField(TEXT("class_filter"), ClassFilter) && !ClassFilter.IsEmpty())
	{
		for (TActorIterator<AActor> It(World); It; ++It)
		{
			AActor* Actor = *It;
			if (Actor)
			{
				FString ActorClassName = Actor->GetClass()->GetName();
				if (ActorClassName.Contains(ClassFilter, ESearchCase::IgnoreCase))
				{
					ActorsToDelete.AddUnique(Actor);
					DeletedNames.AddUnique(Actor->GetName());
				}
			}
		}
	}

	if (ActorsToDelete.Num() == 0)
	{
		if (NotFoundNames.Num() > 0)
		{
			return FMCPToolResult::Error(FString::Printf(TEXT("No actors found: %s"), *FString::Join(NotFoundNames, TEXT(", "))));
		}
		return FMCPToolResult::Error(TEXT("No actors specified or found to delete. Provide actor_name, actor_names array, or class_filter."));
	}

	for (AActor* Actor : ActorsToDelete)
	{
		if (Actor && IsValid(Actor))
		{
			World->EditorDestroyActor(Actor, false);
		}
	}

	MarkWorldDirty(World);

	TSharedPtr<FJsonObject> ResultData = MakeShared<FJsonObject>();
	ResultData->SetArrayField(TEXT("deleted"), StringArrayToJsonArray(DeletedNames));
	ResultData->SetNumberField(TEXT("count"), DeletedNames.Num());

	if (NotFoundNames.Num() > 0)
	{
		ResultData->SetArrayField(TEXT("notFound"), StringArrayToJsonArray(NotFoundNames));
	}

	return FMCPToolResult::Success(
		FString::Printf(TEXT("Deleted %d actor(s)"), DeletedNames.Num()),
		ResultData
	);
}
