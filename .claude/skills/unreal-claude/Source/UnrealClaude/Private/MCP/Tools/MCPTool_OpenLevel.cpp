// Copyright Natali Caggiano. All Rights Reserved.

#include "MCPTool_OpenLevel.h"
#include "UnrealClaudeModule.h"
#include "FileHelpers.h"
#include "Editor/UnrealEdEngine.h"
#include "UnrealEdGlobals.h"
#include "Editor.h"
#include "Misc/PackageName.h"
#include "ContentStreaming.h"
#include "UObject/UObjectGlobals.h"

/**
 * Wait for async loading and texture streaming to settle after a level load.
 * Polls GetNumWantingResources() until stable, rather than using a fixed timeout.
 * Returns the elapsed wait time in seconds.
 *
 * Prevents race conditions in the streaming manager's LevelRenderAssetManagersLock
 * when subsequent tool calls arrive before the engine finishes processing the new level.
 */
static double WaitForLevelStreaming()
{
	const double StartTime = FPlatformTime::Seconds();
	constexpr double MaxWaitSeconds = 30.0;
	constexpr int32 RequiredStableChecks = 3;

	// Phase 1: drain async package loads — must complete before polling streaming
	FlushAsyncLoading();

	if (IStreamingManager::HasShutdown())
	{
		return FPlatformTime::Seconds() - StartTime;
	}

	// Phase 2: poll until streaming has been stable for RequiredStableChecks iterations (avoids returning during a brief lull)
	IStreamingManager& StreamingMgr = IStreamingManager::Get();
	int32 StableChecks = 0;

	while (FPlatformTime::Seconds() - StartTime < MaxWaitSeconds)
	{
		// 100ms batch per iteration keeps the editor responsive without overshooting MaxWaitSeconds
		StreamingMgr.BlockTillAllRequestsFinished(0.1f, false);

		const bool bDoneStreaming = StreamingMgr.GetNumWantingResources() == 0;
		const bool bDoneLoading = !IsAsyncLoading();

		if (bDoneStreaming && bDoneLoading)
		{
			if (++StableChecks >= RequiredStableChecks)
			{
				break;
			}
		}
		else
		{
			StableChecks = 0;
		}
	}

	return FPlatformTime::Seconds() - StartTime;
}

FMCPToolResult FMCPTool_OpenLevel::Execute(const TSharedRef<FJsonObject>& Params)
{
	FString Action;
	TOptional<FMCPToolResult> Error;
	if (!ExtractRequiredString(Params, TEXT("action"), Action, Error))
	{
		return Error.GetValue();
	}

	Action = Action.ToLower().TrimStartAndEnd();

	if (Action == TEXT("open"))
	{
		return ExecuteOpen(Params);
	}
	else if (Action == TEXT("new"))
	{
		return ExecuteNew(Params);
	}
	else if (Action == TEXT("save_as"))
	{
		return ExecuteSaveAs(Params);
	}
	else if (Action == TEXT("list_templates"))
	{
		return ExecuteListTemplates();
	}

	return FMCPToolResult::Error(FString::Printf(
		TEXT("Unknown action: '%s'. Use 'open', 'new', 'save_as', or 'list_templates'."), *Action));
}

FMCPToolResult FMCPTool_OpenLevel::ExecuteOpen(const TSharedRef<FJsonObject>& Params)
{
	FString LevelPath;
	TOptional<FMCPToolResult> Error;
	if (!ExtractRequiredString(Params, TEXT("level_path"), LevelPath, Error))
	{
		return Error.GetValue();
	}

	FString ValidationError;
	if (!ValidateLevelPath(LevelPath, ValidationError))
	{
		return FMCPToolResult::Error(ValidationError);
	}

	FString PackagePath = LevelPath;
	if (!PackagePath.EndsWith(TEXT(".umap")))
	{
		if (!FPackageName::DoesPackageExist(PackagePath))
		{
			return FMCPToolResult::Error(FString::Printf(
				TEXT("Level not found: '%s'. Use asset_search to find available maps."), *LevelPath));
		}
	}

	FString Filename;
	if (!FPackageName::TryConvertLongPackageNameToFilename(PackagePath, Filename, FPackageName::GetMapPackageExtension()))
	{
		return FMCPToolResult::Error(FString::Printf(
			TEXT("Could not resolve level path: '%s'"), *LevelPath));
	}

	// LoadMap internally prompts the user to save the current world if dirty
	UWorld* LoadedWorld = UEditorLoadingAndSavingUtils::LoadMap(Filename);

	if (!LoadedWorld)
	{
		return FMCPToolResult::Error(FString::Printf(
			TEXT("Failed to load level: '%s'"), *LevelPath));
	}

	// Block until streaming settles — prevents follow-up tool calls from racing on LevelRenderAssetManagersLock
	const double WaitTime = WaitForLevelStreaming();

	TSharedPtr<FJsonObject> ResultData = MakeShared<FJsonObject>();
	ResultData->SetStringField(TEXT("action"), TEXT("open"));
	ResultData->SetStringField(TEXT("levelPath"), LevelPath);
	ResultData->SetStringField(TEXT("mapName"), LoadedWorld->GetMapName());
	ResultData->SetStringField(TEXT("worldName"), LoadedWorld->GetName());
	ResultData->SetNumberField(TEXT("streaming_wait_seconds"), WaitTime);

	return FMCPToolResult::Success(
		FString::Printf(TEXT("Opened level: %s"), *LoadedWorld->GetMapName()), ResultData);
}

FMCPToolResult FMCPTool_OpenLevel::ExecuteNew(const TSharedRef<FJsonObject>& Params)
{
	FString TemplateName = ExtractOptionalString(Params, TEXT("template"));
	bool bSaveCurrent = ExtractOptionalBool(Params, TEXT("save_current"), true);

	if (TemplateName.IsEmpty())
	{
		UWorld* NewWorld = UEditorLoadingAndSavingUtils::NewBlankMap(bSaveCurrent);

		if (!NewWorld)
		{
			return FMCPToolResult::Error(TEXT("Failed to create new blank map."));
		}

		TSharedPtr<FJsonObject> ResultData = MakeShared<FJsonObject>();
		ResultData->SetStringField(TEXT("action"), TEXT("new"));
		ResultData->SetStringField(TEXT("template"), TEXT("blank"));
		ResultData->SetStringField(TEXT("mapName"), NewWorld->GetMapName());

		return FMCPToolResult::Success(
			FString::Printf(TEXT("Created new blank map: %s"), *NewWorld->GetMapName()), ResultData);
	}

	if (!GUnrealEd)
	{
		return FMCPToolResult::Error(TEXT("Editor engine not available."));
	}

	const TArray<FTemplateMapInfo>& Templates = GUnrealEd->GetTemplateMapInfos();
	FString TemplateNameLower = TemplateName.ToLower();

	const FTemplateMapInfo* FoundTemplate = nullptr;
	for (const FTemplateMapInfo& Template : Templates)
	{
		FString DisplayName = FPaths::GetBaseFilename(Template.Map.ToString());
		if (DisplayName.ToLower() == TemplateNameLower ||
			Template.Map.ToString().ToLower().Contains(TemplateNameLower))
		{
			FoundTemplate = &Template;
			break;
		}
	}

	if (!FoundTemplate)
	{
		return FMCPToolResult::Error(FString::Printf(
			TEXT("Template '%s' not found. Use action 'list_templates' to see available templates."),
			*TemplateName));
	}

	FString TemplateFilename;
	FString TemplatePackageName = FoundTemplate->Map.ToString();
	if (!FPackageName::TryConvertLongPackageNameToFilename(TemplatePackageName, TemplateFilename, FPackageName::GetMapPackageExtension()))
	{
		return FMCPToolResult::Error(FString::Printf(
			TEXT("Could not resolve template path: '%s'"), *TemplatePackageName));
	}

	UWorld* NewWorld = UEditorLoadingAndSavingUtils::LoadMap(TemplateFilename);

	if (!NewWorld)
	{
		return FMCPToolResult::Error(FString::Printf(
			TEXT("Failed to create map from template: '%s'"), *TemplateName));
	}

	const double WaitTime = WaitForLevelStreaming();

	TSharedPtr<FJsonObject> ResultData = MakeShared<FJsonObject>();
	ResultData->SetStringField(TEXT("action"), TEXT("new"));
	ResultData->SetStringField(TEXT("template"), TemplateName);
	ResultData->SetStringField(TEXT("mapName"), NewWorld->GetMapName());
	ResultData->SetNumberField(TEXT("streaming_wait_seconds"), WaitTime);

	return FMCPToolResult::Success(
		FString::Printf(TEXT("Created new map from template '%s': %s"), *TemplateName, *NewWorld->GetMapName()),
		ResultData);
}

FMCPToolResult FMCPTool_OpenLevel::ExecuteSaveAs(const TSharedRef<FJsonObject>& Params)
{
	FString SavePath;
	TOptional<FMCPToolResult> Error;
	if (!ExtractRequiredString(Params, TEXT("save_path"), SavePath, Error))
	{
		return Error.GetValue();
	}

	FString ValidationError;
	if (!ValidateLevelPath(SavePath, ValidationError))
	{
		return FMCPToolResult::Error(ValidationError);
	}

	if (!GEditor)
	{
		return FMCPToolResult::Error(TEXT("Editor not available"));
	}
	UWorld* World = GEditor->GetEditorWorldContext().World();
	if (!World)
	{
		return FMCPToolResult::Error(TEXT("No world currently loaded"));
	}

	FString Filename = FPackageName::LongPackageNameToFilename(SavePath, FPackageName::GetMapPackageExtension());

	bool bSaved = FEditorFileUtils::SaveMap(World, Filename);
	if (!bSaved)
	{
		return FMCPToolResult::Error(FString::Printf(
			TEXT("Failed to save level to: '%s'"), *SavePath));
	}

	TSharedPtr<FJsonObject> ResultData = MakeShared<FJsonObject>();
	ResultData->SetStringField(TEXT("action"), TEXT("save_as"));
	ResultData->SetStringField(TEXT("save_path"), SavePath);
	ResultData->SetStringField(TEXT("filename"), Filename);
	ResultData->SetStringField(TEXT("mapName"), World->GetMapName());

	return FMCPToolResult::Success(
		FString::Printf(TEXT("Saved level to: %s"), *SavePath), ResultData);
}

FMCPToolResult FMCPTool_OpenLevel::ExecuteListTemplates()
{
	if (!GUnrealEd)
	{
		return FMCPToolResult::Error(TEXT("Editor engine not available."));
	}

	const TArray<FTemplateMapInfo>& Templates = GUnrealEd->GetTemplateMapInfos();

	TSharedPtr<FJsonObject> ResultData = MakeShared<FJsonObject>();
	TArray<TSharedPtr<FJsonValue>> TemplateArray;

	for (const FTemplateMapInfo& Template : Templates)
	{
		TSharedPtr<FJsonObject> TemplateObj = MakeShared<FJsonObject>();

		FString DisplayName = FPaths::GetBaseFilename(Template.Map.ToString());
		TemplateObj->SetStringField(TEXT("name"), DisplayName);
		TemplateObj->SetStringField(TEXT("mapPath"), Template.Map.ToString());

		TemplateArray.Add(MakeShared<FJsonValueObject>(TemplateObj));
	}

	ResultData->SetStringField(TEXT("action"), TEXT("list_templates"));
	ResultData->SetNumberField(TEXT("count"), Templates.Num());
	ResultData->SetArrayField(TEXT("templates"), TemplateArray);

	return FMCPToolResult::Success(
		FString::Printf(TEXT("Found %d available map templates."), Templates.Num()), ResultData);
}

bool FMCPTool_OpenLevel::ValidateLevelPath(const FString& Path, FString& OutError)
{
	if (Path.IsEmpty())
	{
		OutError = TEXT("Level path cannot be empty");
		return false;
	}

	if (Path.Len() > 512)
	{
		OutError = TEXT("Level path exceeds maximum length of 512 characters");
		return false;
	}

	if (Path.StartsWith(TEXT("/Engine/")) || Path.StartsWith(TEXT("/Script/")))
	{
		OutError = TEXT("Cannot open engine or script levels");
		return false;
	}

	if (Path.Contains(TEXT("..")))
	{
		OutError = TEXT("Level path cannot contain path traversal sequences");
		return false;
	}

	using namespace UnrealClaudeConstants::MCPValidation;
	int32 FoundIndex;
	for (const TCHAR* c = DangerousChars; *c; ++c)
	{
		if (Path.FindChar(*c, FoundIndex))
		{
			OutError = FString::Printf(TEXT("Level path contains invalid character: '%c'"), *c);
			return false;
		}
	}

	if (!Path.StartsWith(TEXT("/Game/")))
	{
		OutError = TEXT("Level path must start with '/Game/' to reference project content");
		return false;
	}

	return true;
}
