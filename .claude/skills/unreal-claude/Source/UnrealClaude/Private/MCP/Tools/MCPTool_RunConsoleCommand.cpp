// Copyright Natali Caggiano. All Rights Reserved.

#include "MCPTool_RunConsoleCommand.h"
#include "MCP/MCPParamValidator.h"
#include "UnrealClaudeModule.h"
#include "UnrealClaudeUtils.h"
#include "Editor.h"
#include "Engine/World.h"

FMCPToolResult FMCPTool_RunConsoleCommand::Execute(const TSharedRef<FJsonObject>& Params)
{
	UWorld* World = nullptr;
	if (auto Error = ValidateEditorContext(World))
	{
		return Error.GetValue();
	}

	FString Command;
	TOptional<FMCPToolResult> ParamError;
	if (!ExtractRequiredString(Params, TEXT("command"), Command, ParamError))
	{
		return ParamError.GetValue();
	}
	if (!ValidateConsoleCommandParam(Command, ParamError))
	{
		return ParamError.GetValue();
	}

	UE_LOG(LogUnrealClaude, Log, TEXT("Executing console command: %s"), *Command);

	FUnrealClaudeOutputDevice OutputDevice;

	GEditor->Exec(World, *Command, OutputDevice);

	TSharedPtr<FJsonObject> ResultData = MakeShared<FJsonObject>();
	ResultData->SetStringField(TEXT("command"), Command);
	ResultData->SetStringField(TEXT("output"), OutputDevice.GetTrimmedOutput());

	return FMCPToolResult::Success(
		FString::Printf(TEXT("Executed command: %s"), *Command),
		ResultData
	);
}
