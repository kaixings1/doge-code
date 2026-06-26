// Copyright Natali Caggiano. All Rights Reserved.

#include "BlueprintLoader.h"
#include "MCP/MCPParamValidator.h"
#include "UnrealClaudeModule.h"
#include "Engine/BlueprintGeneratedClass.h"
#include "Kismet2/KismetEditorUtilities.h"
#include "Kismet2/BlueprintEditorUtils.h"
#include "Kismet2/CompilerResultsLog.h"
#include "AssetToolsModule.h"
#include "Factories/BlueprintFactory.h"
#include "Logging/MessageLog.h"
#include "Misc/UObjectToken.h"
#include "EdGraph/EdGraphNode.h"

UBlueprint* FBlueprintLoader::LoadBlueprint(const FString& BlueprintPath, FString& OutError)
{
	if (BlueprintPath.IsEmpty())
	{
		OutError = TEXT("Blueprint path cannot be empty");
		return nullptr;
	}

	UBlueprint* Blueprint = LoadObject<UBlueprint>(nullptr, *BlueprintPath);

	// Fallback: prepend /Game/ for short paths
	if (!Blueprint)
	{
		FString AdjustedPath = BlueprintPath;
		if (!AdjustedPath.StartsWith(TEXT("/")))
		{
			AdjustedPath = TEXT("/Game/") + AdjustedPath;
		}
		Blueprint = LoadObject<UBlueprint>(nullptr, *AdjustedPath);
	}

	if (!Blueprint)
	{
		OutError = FString::Printf(TEXT("Could not load Blueprint: %s"), *BlueprintPath);
		return nullptr;
	}

	return Blueprint;
}

bool FBlueprintLoader::ValidateBlueprintPath(const FString& BlueprintPath, FString& OutError)
{
	return FMCPParamValidator::ValidateBlueprintPath(BlueprintPath, OutError);
}

bool FBlueprintLoader::IsBlueprintEditable(UBlueprint* Blueprint, FString& OutError)
{
	if (!Blueprint)
	{
		OutError = TEXT("Blueprint is null");
		return false;
	}

	UPackage* Package = Blueprint->GetPackage();
	if (!Package)
	{
		OutError = TEXT("Blueprint package is invalid");
		return false;
	}

	FString PackageName = Package->GetName();
	if (PackageName.StartsWith(TEXT("/Engine/")) || PackageName.StartsWith(TEXT("/Script/")))
	{
		OutError = TEXT("Cannot modify engine Blueprints");
		return false;
	}

	if (Package->HasAnyPackageFlags(PKG_Cooked))
	{
		OutError = TEXT("Blueprint package is read-only (cooked)");
		return false;
	}

	return true;
}

bool FBlueprintLoader::CompileBlueprint(UBlueprint* Blueprint, FString& OutError)
{
	FBlueprintCompileResult Result = CompileBlueprintWithResult(Blueprint);
	if (!Result.bSuccess)
	{
		// Keep verbose output flowing through OutError for backward-compat callers
		OutError = Result.VerboseOutput.IsEmpty() ?
			TEXT("Blueprint compilation failed") : Result.VerboseOutput;
		return false;
	}
	return true;
}

FBlueprintCompileResult FBlueprintLoader::CompileBlueprintWithResult(UBlueprint* Blueprint)
{
	FBlueprintCompileResult Result;

	if (!Blueprint)
	{
		Result.StatusString = TEXT("Error");
		Result.VerboseOutput = TEXT("Blueprint is null");
		FBlueprintCompileMessage Msg;
		Msg.Severity = TEXT("Error");
		Msg.Message = TEXT("Blueprint is null");
		Result.Messages.Add(Msg);
		Result.ErrorCount = 1;
		return Result;
	}

	const FName BlueprintLogName = TEXT("BlueprintLog");
	FMessageLog BlueprintLog(BlueprintLogName);

	// MarkAsStructurallyModified before compile forces a fresh recompile (skips incremental cache)
	FBlueprintEditorUtils::MarkBlueprintAsStructurallyModified(Blueprint);

	FKismetEditorUtilities::CompileBlueprint(Blueprint);

	TStringBuilder<1024> VerboseBuilder;
	VerboseBuilder.Appendf(TEXT("Compiling Blueprint: %s\n"), *Blueprint->GetName());

	switch (Blueprint->Status)
	{
	case BS_Error:
		Result.StatusString = TEXT("Error");
		Result.bSuccess = false;
		VerboseBuilder.Append(TEXT("Status: FAILED (Errors)\n"));
		break;
	case BS_UpToDate:
		Result.StatusString = TEXT("UpToDate");
		Result.bSuccess = true;
		VerboseBuilder.Append(TEXT("Status: SUCCESS (Up to Date)\n"));
		break;
	case BS_UpToDateWithWarnings:
		Result.StatusString = TEXT("UpToDateWithWarnings");
		Result.bSuccess = true;
		VerboseBuilder.Append(TEXT("Status: SUCCESS (With Warnings)\n"));
		break;
	case BS_Dirty:
		Result.StatusString = TEXT("Dirty");
		Result.bSuccess = false;
		VerboseBuilder.Append(TEXT("Status: FAILED (Still Dirty)\n"));
		break;
	default:
		Result.StatusString = TEXT("Unknown");
		Result.bSuccess = (Blueprint->Status != BS_Error);
		VerboseBuilder.Append(TEXT("Status: Unknown\n"));
		break;
	}

	// UE stores compile errors on the nodes themselves, so we walk every graph
	VerboseBuilder.Append(TEXT("\n--- Compiler Messages ---\n"));

	auto ProcessGraph = [&](UEdGraph* Graph)
	{
		if (!Graph) return;

		for (UEdGraphNode* Node : Graph->Nodes)
		{
			if (!Node) continue;

			if (Node->bHasCompilerMessage)
			{
				FBlueprintCompileMessage Msg;
				Msg.NodeName = Node->GetNodeTitle(ENodeTitleType::ListView).ToString();
				Msg.ObjectPath = Node->GetPathName();

				if (Node->ErrorType == EMessageSeverity::Error)
				{
					Msg.Severity = TEXT("Error");
					Result.ErrorCount++;
				}
				else if (Node->ErrorType == EMessageSeverity::Warning)
				{
					Msg.Severity = TEXT("Warning");
					Result.WarningCount++;
				}
				else
				{
					Msg.Severity = TEXT("Info");
				}

				Msg.Message = Node->ErrorMsg;
				Result.Messages.Add(Msg);

				VerboseBuilder.Appendf(TEXT("[%s] Node '%s': %s\n"),
					*Msg.Severity, *Msg.NodeName, *Msg.Message);
			}
		}
	};

	for (UEdGraph* Graph : Blueprint->UbergraphPages)
	{
		ProcessGraph(Graph);
	}
	for (UEdGraph* Graph : Blueprint->FunctionGraphs)
	{
		ProcessGraph(Graph);
	}
	for (UEdGraph* Graph : Blueprint->MacroGraphs)
	{
		ProcessGraph(Graph);
	}

	// Force a generic error message when status is BS_Error but no per-node message was captured
	if (Blueprint->Status == BS_Error && Result.Messages.Num() == 0)
	{
		FBlueprintCompileMessage Msg;
		Msg.Severity = TEXT("Error");
		Msg.Message = TEXT("Blueprint compilation failed (no specific error captured)");
		Result.Messages.Add(Msg);
		Result.ErrorCount = 1;
		VerboseBuilder.Append(TEXT("[Error] Blueprint compilation failed (no specific error captured)\n"));
	}

	VerboseBuilder.Appendf(TEXT("\n--- Summary ---\n"));
	VerboseBuilder.Appendf(TEXT("Errors: %d\n"), Result.ErrorCount);
	VerboseBuilder.Appendf(TEXT("Warnings: %d\n"), Result.WarningCount);
	VerboseBuilder.Appendf(TEXT("Result: %s\n"), Result.bSuccess ? TEXT("Success") : TEXT("Failed"));

	Result.VerboseOutput = VerboseBuilder.ToString();

	UE_LOG(LogUnrealClaude, Log, TEXT("Blueprint '%s' compiled: %s (Errors: %d, Warnings: %d)"),
		*Blueprint->GetName(), *Result.StatusString, Result.ErrorCount, Result.WarningCount);

	return Result;
}

void FBlueprintLoader::MarkBlueprintDirty(UBlueprint* Blueprint)
{
	if (Blueprint)
	{
		Blueprint->MarkPackageDirty();
	}
}

UBlueprint* FBlueprintLoader::CreateBlueprint(
	const FString& PackagePath,
	const FString& BlueprintName,
	UClass* ParentClass,
	EBlueprintType BlueprintType,
	FString& OutError)
{
	if (PackagePath.IsEmpty() || BlueprintName.IsEmpty())
	{
		OutError = TEXT("Package path and Blueprint name are required");
		return nullptr;
	}

	if (!ParentClass)
	{
		OutError = TEXT("Parent class is required");
		return nullptr;
	}

	FString FullPath = PackagePath / BlueprintName;
	UPackage* Package = CreatePackage(*FullPath);
	if (!Package)
	{
		OutError = FString::Printf(TEXT("Failed to create package: %s"), *FullPath);
		return nullptr;
	}

	UBlueprintFactory* Factory = NewObject<UBlueprintFactory>();
	Factory->ParentClass = ParentClass;
	Factory->BlueprintType = BlueprintType;

	UBlueprint* NewBlueprint = Cast<UBlueprint>(Factory->FactoryCreateNew(
		UBlueprint::StaticClass(),
		Package,
		FName(*BlueprintName),
		RF_Public | RF_Standalone,
		nullptr,
		GWarn
	));

	if (!NewBlueprint)
	{
		OutError = TEXT("Failed to create Blueprint");
		return nullptr;
	}

	Package->MarkPackageDirty();

	UE_LOG(LogUnrealClaude, Log, TEXT("Created Blueprint: %s (Parent: %s)"),
		*FullPath, *ParentClass->GetName());

	return NewBlueprint;
}

UClass* FBlueprintLoader::FindParentClass(const FString& ParentClassName, FString& OutError)
{
	if (ParentClassName.IsEmpty())
	{
		OutError = TEXT("Parent class name cannot be empty");
		return nullptr;
	}

	UClass* ParentClass = nullptr;

	ParentClass = LoadClass<UObject>(nullptr, *ParentClassName);

	// Fall back through /Script/Engine, /Script/CoreUObject, and finally FindObject for short names
	if (!ParentClass)
	{
		ParentClass = LoadClass<UObject>(nullptr,
			*FString::Printf(TEXT("/Script/Engine.%s"), *ParentClassName));
	}

	if (!ParentClass)
	{
		ParentClass = LoadClass<UObject>(nullptr,
			*FString::Printf(TEXT("/Script/CoreUObject.%s"), *ParentClassName));
	}

	if (!ParentClass)
	{
		ParentClass = FindObject<UClass>(nullptr, *ParentClassName);
	}

	if (!ParentClass)
	{
		OutError = FString::Printf(TEXT("Parent class not found: %s"), *ParentClassName);
		return nullptr;
	}

	return ParentClass;
}
