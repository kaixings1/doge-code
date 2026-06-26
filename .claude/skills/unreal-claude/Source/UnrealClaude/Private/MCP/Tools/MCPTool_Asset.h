// Copyright Natali Caggiano. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "MCP/MCPToolBase.h"
#include "Dom/JsonObject.h"
#include "Dom/JsonValue.h"

/**
 * MCP Tool for generic asset operations.
 *
 * Provides operations for:
 * - Setting properties on any loaded asset using reflection
 * - Saving assets to disk
 * - Getting asset information
 *
 * This tool works with assets in the Content Browser, not actors in a level.
 * Use set_property for actor properties, use this tool for asset properties.
 *
 * Operations:
 * - set_asset_property: Set a property on an asset using reflection
 * - save_asset: Save an asset to disk (mark dirty and/or save)
 * - get_asset_info: Get information about an asset
 * - list_assets: List assets in a directory with optional filtering
 * - duplicate: Copy an asset to a new path
 * - rename: Rename an asset within its current directory
 * - delete: Delete an asset from disk
 * - move: Move an asset to a different directory (keeps its name)
 * - reimport: Reimport an asset from its original source file
 */
class FMCPTool_Asset : public FMCPToolBase
{
public:
	virtual FMCPToolInfo GetInfo() const override;
	virtual FMCPToolResult Execute(const TSharedRef<FJsonObject>& Params) override;

private:
	FMCPToolResult ExecuteSetAssetProperty(const TSharedRef<FJsonObject>& Params);
	FMCPToolResult ExecuteSaveAsset(const TSharedRef<FJsonObject>& Params);
	FMCPToolResult ExecuteGetAssetInfo(const TSharedRef<FJsonObject>& Params);
	FMCPToolResult ExecuteListAssets(const TSharedRef<FJsonObject>& Params);
	FMCPToolResult ExecuteDuplicateAsset(const TSharedRef<FJsonObject>& Params);
	FMCPToolResult ExecuteRenameAsset(const TSharedRef<FJsonObject>& Params);
	FMCPToolResult ExecuteDeleteAsset(const TSharedRef<FJsonObject>& Params);
	FMCPToolResult ExecuteMoveAsset(const TSharedRef<FJsonObject>& Params);
	FMCPToolResult ExecuteReimportAsset(const TSharedRef<FJsonObject>& Params);

	bool NavigateToProperty(
		UObject* StartObject,
		const TArray<FString>& PathParts,
		UObject*& OutObject,
		FProperty*& OutProperty,
		FString& OutError);

	bool SetPropertyFromJson(
		UObject* Object,
		const FString& PropertyPath,
		const TSharedPtr<FJsonValue>& Value,
		FString& OutError);

	bool SetNumericPropertyValue(FNumericProperty* NumProp, void* ValuePtr, const TSharedPtr<FJsonValue>& Value);
	bool SetStructPropertyValue(FStructProperty* StructProp, void* ValuePtr, const TSharedPtr<FJsonValue>& Value);
	bool SetObjectPropertyValue(FObjectProperty* ObjProp, void* ValuePtr, const TSharedPtr<FJsonValue>& Value, FString& OutError);

	UObject* LoadAssetByPath(const FString& AssetPath, FString& OutError);

	TSharedPtr<FJsonObject> BuildAssetInfoJson(UObject* Asset);
	TArray<TSharedPtr<FJsonValue>> GetAssetProperties(UObject* Asset, bool bEditableOnly);
};
