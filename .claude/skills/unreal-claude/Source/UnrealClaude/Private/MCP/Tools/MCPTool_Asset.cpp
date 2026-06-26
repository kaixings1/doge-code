// Copyright Natali Caggiano. All Rights Reserved.

#include "MCPTool_Asset.h"
#include "MCP/MCPParamValidator.h"
#include "UnrealClaudeModule.h"
#include "Editor.h"
#include "EditorReimportHandler.h"

#include "AssetRegistry/AssetRegistryModule.h"
#include "AssetRegistry/IAssetRegistry.h"
#include "EditorAssetLibrary.h"
#include "UObject/SavePackage.h"
#include "Misc/PackageName.h"
#include "Misc/Paths.h"
#include "UObject/PropertyAccessUtil.h"
#include "Engine/SkeletalMesh.h"
#include "Dom/JsonValue.h"

FMCPToolInfo FMCPTool_Asset::GetInfo() const
{
	FMCPToolInfo Info;
	Info.Name = TEXT("asset");
	Info.Description = TEXT("Generic asset operations: set properties, save, and query assets in Content Browser");

	Info.Parameters.Add(FMCPToolParameter(TEXT("operation"), TEXT("string"),
		TEXT("Operation: set_asset_property, save_asset, get_asset_info, list_assets, duplicate, rename, delete, move, reimport"), true));

	Info.Parameters.Add(FMCPToolParameter(TEXT("asset_path"), TEXT("string"),
		TEXT("Asset path (e.g., /Game/Characters/MyMesh). For duplicate/rename/move this is the source asset."), false));

	Info.Parameters.Add(FMCPToolParameter(TEXT("property"), TEXT("string"),
		TEXT("Property path (e.g., Materials.0.MaterialInterface, bEnableGravity)"), false));
	Info.Parameters.Add(FMCPToolParameter(TEXT("value"), TEXT("any"),
		TEXT("Value to set (type must match property type)"), false));

	Info.Parameters.Add(FMCPToolParameter(TEXT("save"), TEXT("boolean"),
		TEXT("Actually save to disk (default: true)"), false));
	Info.Parameters.Add(FMCPToolParameter(TEXT("mark_dirty"), TEXT("boolean"),
		TEXT("Mark the asset as dirty (default: true if save is false)"), false));

	Info.Parameters.Add(FMCPToolParameter(TEXT("include_properties"), TEXT("boolean"),
		TEXT("Include editable property list (default: false)"), false));

	Info.Parameters.Add(FMCPToolParameter(TEXT("directory"), TEXT("string"),
		TEXT("Directory to list (e.g., /Game/Characters/)"), false));
	Info.Parameters.Add(FMCPToolParameter(TEXT("class_filter"), TEXT("string"),
		TEXT("Filter by class name (e.g., SkeletalMesh, StaticMesh, Material)"), false));
	Info.Parameters.Add(FMCPToolParameter(TEXT("recursive"), TEXT("boolean"),
		TEXT("Search recursively (default: false)"), false));
	Info.Parameters.Add(FMCPToolParameter(TEXT("limit"), TEXT("integer"),
		TEXT("Maximum results (1-1000, default: 25)"), false));

	Info.Parameters.Add(FMCPToolParameter(TEXT("destination_path"), TEXT("string"),
		TEXT("Full destination asset path for duplicate (e.g., /Game/Characters/MyMesh_Copy)"), false));
	Info.Parameters.Add(FMCPToolParameter(TEXT("new_name"), TEXT("string"),
		TEXT("New asset name for rename (name only, no path)"), false));
	Info.Parameters.Add(FMCPToolParameter(TEXT("destination_directory"), TEXT("string"),
		TEXT("Destination directory for move (e.g., /Game/Characters/Heroes/). Asset name is preserved."), false));

	Info.Annotations = FMCPToolAnnotations::Modifying();

	return Info;
}

FMCPToolResult FMCPTool_Asset::Execute(const TSharedRef<FJsonObject>& Params)
{
	FString Operation;
	TOptional<FMCPToolResult> Error;
	if (!ExtractRequiredString(Params, TEXT("operation"), Operation, Error))
	{
		return Error.GetValue();
	}

	Operation = Operation.ToLower();

	if (Operation == TEXT("set_asset_property"))
	{
		return ExecuteSetAssetProperty(Params);
	}
	else if (Operation == TEXT("save_asset"))
	{
		return ExecuteSaveAsset(Params);
	}
	else if (Operation == TEXT("get_asset_info"))
	{
		return ExecuteGetAssetInfo(Params);
	}
	else if (Operation == TEXT("list_assets"))
	{
		return ExecuteListAssets(Params);
	}
	else if (Operation == TEXT("duplicate"))
	{
		return ExecuteDuplicateAsset(Params);
	}
	else if (Operation == TEXT("rename"))
	{
		return ExecuteRenameAsset(Params);
	}
	else if (Operation == TEXT("delete"))
	{
		return ExecuteDeleteAsset(Params);
	}
	else if (Operation == TEXT("move"))
	{
		return ExecuteMoveAsset(Params);
	}
	else if (Operation == TEXT("reimport"))
	{
		return ExecuteReimportAsset(Params);
	}

	return FMCPToolResult::Error(FString::Printf(
		TEXT("Unknown operation: %s. Valid: set_asset_property, save_asset, get_asset_info, list_assets, duplicate, rename, delete, move, reimport"),
		*Operation));
}

FMCPToolResult FMCPTool_Asset::ExecuteSetAssetProperty(const TSharedRef<FJsonObject>& Params)
{
	FString AssetPath;
	FString PropertyPath;
	TOptional<FMCPToolResult> Error;

	if (!ExtractRequiredString(Params, TEXT("asset_path"), AssetPath, Error))
	{
		return Error.GetValue();
	}
	if (!ExtractRequiredString(Params, TEXT("property"), PropertyPath, Error))
	{
		return Error.GetValue();
	}
	if (!ValidateBlueprintPathParam(AssetPath, Error))
	{
		return Error.GetValue();
	}
	if (!ValidatePropertyPathParam(PropertyPath, Error))
	{
		return Error.GetValue();
	}

	if (!Params->HasField(TEXT("value")))
	{
		return FMCPToolResult::Error(TEXT("Missing required parameter: value"));
	}
	TSharedPtr<FJsonValue> Value = Params->TryGetField(TEXT("value"));

	FString LoadError;
	UObject* Asset = LoadAssetByPath(AssetPath, LoadError);
	if (!Asset)
	{
		return FMCPToolResult::Error(LoadError);
	}

	FString PropertyError;
	if (!SetPropertyFromJson(Asset, PropertyPath, Value, PropertyError))
	{
		return FMCPToolResult::Error(PropertyError);
	}

	Asset->PostEditChange();
	Asset->MarkPackageDirty();

	TSharedPtr<FJsonObject> ResultData = MakeShared<FJsonObject>();
	ResultData->SetStringField(TEXT("asset_path"), AssetPath);
	ResultData->SetStringField(TEXT("property"), PropertyPath);
	ResultData->SetBoolField(TEXT("modified"), true);

	return FMCPToolResult::Success(
		FString::Printf(TEXT("Set property '%s' on asset '%s'"), *PropertyPath, *Asset->GetName()),
		ResultData
	);
}

FMCPToolResult FMCPTool_Asset::ExecuteSaveAsset(const TSharedRef<FJsonObject>& Params)
{
	FString AssetPath;
	TOptional<FMCPToolResult> Error;

	if (!ExtractRequiredString(Params, TEXT("asset_path"), AssetPath, Error))
	{
		return Error.GetValue();
	}
	if (!ValidateBlueprintPathParam(AssetPath, Error))
	{
		return Error.GetValue();
	}

	bool bSave = true;
	if (Params->HasField(TEXT("save")))
	{
		bSave = Params->GetBoolField(TEXT("save"));
	}

	// When not saving, default to marking dirty so the editor flags it for the user's next manual save
	bool bMarkDirty = !bSave; // Default to marking dirty if not saving
	if (Params->HasField(TEXT("mark_dirty")))
	{
		bMarkDirty = Params->GetBoolField(TEXT("mark_dirty"));
	}

	FString LoadError;
	UObject* Asset = LoadAssetByPath(AssetPath, LoadError);
	if (!Asset)
	{
		return FMCPToolResult::Error(LoadError);
	}

	bool bWasSaved = false;
	bool bWasMarkedDirty = false;

	if (bMarkDirty)
	{
		Asset->MarkPackageDirty();
		bWasMarkedDirty = true;
	}

	if (bSave)
	{
		UPackage* Package = Asset->GetOutermost();
		FString PackageFileName = FPackageName::LongPackageNameToFilename(
			Package->GetName(),
			FPackageName::GetAssetPackageExtension()
		);

		FSavePackageArgs SaveArgs;
		SaveArgs.TopLevelFlags = RF_Public | RF_Standalone;
		FSavePackageResultStruct SaveResult = UPackage::Save(Package, Asset, *PackageFileName, SaveArgs);

		bWasSaved = SaveResult.IsSuccessful();
		if (!bWasSaved)
		{
			return FMCPToolResult::Error(FString::Printf(TEXT("Failed to save asset: %s"), *AssetPath));
		}
	}

	TSharedPtr<FJsonObject> ResultData = MakeShared<FJsonObject>();
	ResultData->SetStringField(TEXT("asset_path"), AssetPath);
	ResultData->SetBoolField(TEXT("saved"), bWasSaved);
	ResultData->SetBoolField(TEXT("marked_dirty"), bWasMarkedDirty);

	FString Message = bWasSaved
		? FString::Printf(TEXT("Saved asset: %s"), *AssetPath)
		: FString::Printf(TEXT("Marked asset dirty: %s"), *AssetPath);

	return FMCPToolResult::Success(Message, ResultData);
}

FMCPToolResult FMCPTool_Asset::ExecuteGetAssetInfo(const TSharedRef<FJsonObject>& Params)
{
	FString AssetPath;
	TOptional<FMCPToolResult> Error;

	if (!ExtractRequiredString(Params, TEXT("asset_path"), AssetPath, Error))
	{
		return Error.GetValue();
	}
	if (!ValidateBlueprintPathParam(AssetPath, Error))
	{
		return Error.GetValue();
	}

	bool bIncludeProperties = false;
	if (Params->HasField(TEXT("include_properties")))
	{
		bIncludeProperties = Params->GetBoolField(TEXT("include_properties"));
	}

	FString LoadError;
	UObject* Asset = LoadAssetByPath(AssetPath, LoadError);
	if (!Asset)
	{
		return FMCPToolResult::Error(LoadError);
	}

	TSharedPtr<FJsonObject> ResultData = BuildAssetInfoJson(Asset);

	if (bIncludeProperties)
	{
		ResultData->SetArrayField(TEXT("properties"), GetAssetProperties(Asset, true));
	}

	return FMCPToolResult::Success(
		FString::Printf(TEXT("Asset info: %s"), *Asset->GetName()),
		ResultData
	);
}

FMCPToolResult FMCPTool_Asset::ExecuteListAssets(const TSharedRef<FJsonObject>& Params)
{
	// Accept path_filter as alias for directory — asset_search uses path_filter
	// for the same conceptual folder restriction. Cross-tool consistency win.
	TArray<FString> Warnings;
	FString Directory = ExtractOptionalString(Params, TEXT("directory"));
	FString PathFilterAlias;
	const bool bAliasPresent = Directory.IsEmpty()
		&& Params->TryGetStringField(TEXT("path_filter"), PathFilterAlias)
		&& !PathFilterAlias.IsEmpty();
	if (bAliasPresent)
	{
		Directory = PathFilterAlias;
		Warnings.Add(TEXT("Parameter 'path_filter' is not the canonical input for 'list_assets' — use 'directory'. Accepting as alias for cross-tool consistency with asset_search."));
	}
	if (Directory.IsEmpty())
	{
		Directory = TEXT("/Game/");
	}

	auto WithWarnings = [&Warnings](FMCPToolResult R) -> FMCPToolResult
	{
		R.Warnings = Warnings;
		return R;
	};

	TOptional<FMCPToolResult> Error;
	if (!ValidateBlueprintPathParam(Directory, Error))
	{
		return WithWarnings(Error.GetValue());
	}

	FString ClassFilter;
	if (Params->HasField(TEXT("class_filter")))
	{
		ClassFilter = Params->GetStringField(TEXT("class_filter"));
	}

	bool bRecursive = false;
	if (Params->HasField(TEXT("recursive")))
	{
		bRecursive = Params->GetBoolField(TEXT("recursive"));
	}

	int32 Limit = 25;
	if (Params->HasField(TEXT("limit")))
	{
		Limit = FMath::Clamp(Params->GetIntegerField(TEXT("limit")), 1, 1000);
	}

	IAssetRegistry& AssetRegistry = FModuleManager::LoadModuleChecked<FAssetRegistryModule>(TEXT("AssetRegistry")).Get();

	TArray<FAssetData> Assets;
	AssetRegistry.GetAssetsByPath(FName(*Directory), Assets, bRecursive);

	TArray<TSharedPtr<FJsonValue>> ResultArray;
	int32 Count = 0;

	for (const FAssetData& AssetData : Assets)
	{
		if (Count >= Limit)
		{
			break;
		}

		if (!ClassFilter.IsEmpty())
		{
			FString AssetClassName = AssetData.AssetClassPath.GetAssetName().ToString();
			if (!AssetClassName.Contains(ClassFilter))
			{
				continue;
			}
		}

		TSharedPtr<FJsonObject> AssetObj = MakeShared<FJsonObject>();
		AssetObj->SetStringField(TEXT("name"), AssetData.AssetName.ToString());
		AssetObj->SetStringField(TEXT("path"), AssetData.GetObjectPathString());
		AssetObj->SetStringField(TEXT("class"), AssetData.AssetClassPath.GetAssetName().ToString());
		AssetObj->SetStringField(TEXT("package"), AssetData.PackageName.ToString());

		ResultArray.Add(MakeShared<FJsonValueObject>(AssetObj));
		Count++;
	}

	TSharedPtr<FJsonObject> ResultData = MakeShared<FJsonObject>();
	ResultData->SetStringField(TEXT("directory"), Directory);
	ResultData->SetNumberField(TEXT("count"), Count);
	ResultData->SetNumberField(TEXT("total_found"), Assets.Num());
	ResultData->SetArrayField(TEXT("assets"), ResultArray);

	return WithWarnings(FMCPToolResult::Success(
		FString::Printf(TEXT("Found %d assets in %s"), Count, *Directory),
		ResultData
	));
}

UObject* FMCPTool_Asset::LoadAssetByPath(const FString& AssetPath, FString& OutError)
{
	UObject* Asset = LoadObject<UObject>(nullptr, *AssetPath);
	if (!Asset)
	{
		// Blueprint generated classes need a _C suffix to resolve via LoadObject
		if (!AssetPath.EndsWith(TEXT("_C")))
		{
			Asset = LoadObject<UObject>(nullptr, *(AssetPath + TEXT("_C")));
		}
	}

	if (!Asset)
	{
		OutError = FString::Printf(TEXT("Failed to load asset: %s"), *AssetPath);
	}

	return Asset;
}

bool FMCPTool_Asset::NavigateToProperty(
	UObject* StartObject,
	const TArray<FString>& PathParts,
	UObject*& OutObject,
	FProperty*& OutProperty,
	FString& OutError)
{
	OutObject = StartObject;
	OutProperty = nullptr;

	for (int32 i = 0; i < PathParts.Num(); ++i)
	{
		const FString& PartName = PathParts[i];
		const bool bIsLastPart = (i == PathParts.Num() - 1);

		// A numeric path part means index into the prior array property (e.g., "Materials.0")
		int32 ArrayIndex = INDEX_NONE;
		FString PropertyName = PartName;

		if (PartName.IsNumeric())
		{
			ArrayIndex = FCString::Atoi(*PartName);
			if (!OutProperty)
			{
				OutError = FString::Printf(TEXT("Cannot index without preceding array property"));
				return false;
			}

			FArrayProperty* ArrayProp = CastField<FArrayProperty>(OutProperty);
			if (!ArrayProp)
			{
				OutError = FString::Printf(TEXT("Property is not an array, cannot use index"));
				return false;
			}

			FScriptArrayHelper ArrayHelper(ArrayProp, ArrayProp->ContainerPtrToValuePtr<void>(OutObject));
			if (ArrayIndex < 0 || ArrayIndex >= ArrayHelper.Num())
			{
				OutError = FString::Printf(TEXT("Array index %d out of bounds (size: %d)"), ArrayIndex, ArrayHelper.Num());
				return false;
			}

			FProperty* InnerProp = ArrayProp->Inner;
			if (FObjectProperty* ObjProp = CastField<FObjectProperty>(InnerProp))
			{
				void* ElementPtr = ArrayHelper.GetRawPtr(ArrayIndex);
				UObject* ElementObj = ObjProp->GetObjectPropertyValue(ElementPtr);
				if (ElementObj && !bIsLastPart)
				{
					OutObject = ElementObj;
					OutProperty = nullptr;
					continue;
				}
			}

			if (bIsLastPart)
			{
				OutProperty = InnerProp;
				return true;
			}
			continue;
		}

		OutProperty = OutObject->GetClass()->FindPropertyByName(FName(*PropertyName));

		if (!OutProperty)
		{
			OutError = FString::Printf(TEXT("Property not found: %s on %s"), *PropertyName, *OutObject->GetClass()->GetName());
			return false;
		}

		if (!bIsLastPart)
		{
			if (FArrayProperty* ArrayProp = CastField<FArrayProperty>(OutProperty))
			{
				// Keep the array property; the next path part is expected to be a numeric index
				continue;
			}

			if (FObjectProperty* ObjProp = CastField<FObjectProperty>(OutProperty))
			{
				UObject* NestedObj = ObjProp->GetObjectPropertyValue(ObjProp->ContainerPtrToValuePtr<void>(OutObject));
				if (!NestedObj)
				{
					OutError = FString::Printf(TEXT("Nested object is null: %s"), *PropertyName);
					return false;
				}
				OutObject = NestedObj;
				OutProperty = nullptr;
			}
			else if (FStructProperty* StructProp = CastField<FStructProperty>(OutProperty))
			{
				// Limitation: only whole-struct assignment is supported; cannot descend into struct members
				OutError = FString::Printf(TEXT("Cannot navigate into struct property: %s. Set the entire struct instead."), *PropertyName);
				return false;
			}
			else
			{
				OutError = FString::Printf(TEXT("Cannot navigate into property type: %s"), *PropertyName);
				return false;
			}
		}
	}

	return OutProperty != nullptr;
}

bool FMCPTool_Asset::SetPropertyFromJson(UObject* Object, const FString& PropertyPath, const TSharedPtr<FJsonValue>& Value, FString& OutError)
{
	if (!Object || !Value.IsValid())
	{
		OutError = TEXT("Invalid object or value");
		return false;
	}

	TArray<FString> PathParts;
	PropertyPath.ParseIntoArray(PathParts, TEXT("."), true);

	UObject* TargetObject = nullptr;
	FProperty* Property = nullptr;

	if (!NavigateToProperty(Object, PathParts, TargetObject, Property, OutError))
	{
		if (OutError.IsEmpty())
		{
			OutError = FString::Printf(TEXT("Property not found: %s"), *PropertyPath);
		}
		return false;
	}

	void* ValuePtr = Property->ContainerPtrToValuePtr<void>(TargetObject);

	if (FObjectProperty* ObjProp = CastField<FObjectProperty>(Property))
	{
		return SetObjectPropertyValue(ObjProp, ValuePtr, Value, OutError);
	}

	if (FNumericProperty* NumProp = CastField<FNumericProperty>(Property))
	{
		if (SetNumericPropertyValue(NumProp, ValuePtr, Value))
		{
			return true;
		}
	}
	else if (FBoolProperty* BoolProp = CastField<FBoolProperty>(Property))
	{
		bool BoolVal = false;
		if (Value->TryGetBool(BoolVal))
		{
			BoolProp->SetPropertyValue(ValuePtr, BoolVal);
			return true;
		}
	}
	else if (FStrProperty* StrProp = CastField<FStrProperty>(Property))
	{
		FString StrVal;
		if (Value->TryGetString(StrVal))
		{
			StrProp->SetPropertyValue(ValuePtr, StrVal);
			return true;
		}
	}
	else if (FNameProperty* NameProp = CastField<FNameProperty>(Property))
	{
		FString StrVal;
		if (Value->TryGetString(StrVal))
		{
			NameProp->SetPropertyValue(ValuePtr, FName(*StrVal));
			return true;
		}
	}
	else if (FStructProperty* StructProp = CastField<FStructProperty>(Property))
	{
		if (SetStructPropertyValue(StructProp, ValuePtr, Value))
		{
			return true;
		}
	}

	OutError = FString::Printf(TEXT("Unsupported property type for: %s"), *PropertyPath);
	return false;
}

bool FMCPTool_Asset::SetNumericPropertyValue(FNumericProperty* NumProp, void* ValuePtr, const TSharedPtr<FJsonValue>& Value)
{
	if (NumProp->IsFloatingPoint())
	{
		double DoubleVal = 0.0;
		if (Value->TryGetNumber(DoubleVal))
		{
			NumProp->SetFloatingPointPropertyValue(ValuePtr, DoubleVal);
			return true;
		}
	}
	else if (NumProp->IsInteger())
	{
		int64 IntVal = 0;
		if (Value->TryGetNumber(IntVal))
		{
			NumProp->SetIntPropertyValue(ValuePtr, IntVal);
			return true;
		}
	}
	return false;
}

bool FMCPTool_Asset::SetStructPropertyValue(FStructProperty* StructProp, void* ValuePtr, const TSharedPtr<FJsonValue>& Value)
{
	const TSharedPtr<FJsonObject>* ObjVal;
	if (!Value->TryGetObject(ObjVal))
	{
		return false;
	}

	if (StructProp->Struct == TBaseStructure<FVector>::Get())
	{
		FVector Vec;
		(*ObjVal)->TryGetNumberField(TEXT("x"), Vec.X);
		(*ObjVal)->TryGetNumberField(TEXT("y"), Vec.Y);
		(*ObjVal)->TryGetNumberField(TEXT("z"), Vec.Z);
		*reinterpret_cast<FVector*>(ValuePtr) = Vec;
		return true;
	}

	if (StructProp->Struct == TBaseStructure<FRotator>::Get())
	{
		FRotator Rot;
		(*ObjVal)->TryGetNumberField(TEXT("pitch"), Rot.Pitch);
		(*ObjVal)->TryGetNumberField(TEXT("yaw"), Rot.Yaw);
		(*ObjVal)->TryGetNumberField(TEXT("roll"), Rot.Roll);
		*reinterpret_cast<FRotator*>(ValuePtr) = Rot;
		return true;
	}

	if (StructProp->Struct == TBaseStructure<FLinearColor>::Get())
	{
		FLinearColor Color;
		(*ObjVal)->TryGetNumberField(TEXT("r"), Color.R);
		(*ObjVal)->TryGetNumberField(TEXT("g"), Color.G);
		(*ObjVal)->TryGetNumberField(TEXT("b"), Color.B);
		(*ObjVal)->TryGetNumberField(TEXT("a"), Color.A);
		*reinterpret_cast<FLinearColor*>(ValuePtr) = Color;
		return true;
	}

	return false;
}

bool FMCPTool_Asset::SetObjectPropertyValue(FObjectProperty* ObjProp, void* ValuePtr, const TSharedPtr<FJsonValue>& Value, FString& OutError)
{
	FString ObjectPath;
	if (!Value->TryGetString(ObjectPath))
	{
		OutError = TEXT("Object property value must be a string path");
		return false;
	}

	// Empty or "None" clears the reference
	if (ObjectPath.IsEmpty() || ObjectPath.Equals(TEXT("None"), ESearchCase::IgnoreCase))
	{
		ObjProp->SetObjectPropertyValue(ValuePtr, nullptr);
		return true;
	}

	UObject* ReferencedObject = LoadObject<UObject>(nullptr, *ObjectPath);
	if (!ReferencedObject)
	{
		OutError = FString::Printf(TEXT("Failed to load object: %s"), *ObjectPath);
		return false;
	}

	if (!ReferencedObject->IsA(ObjProp->PropertyClass))
	{
		OutError = FString::Printf(TEXT("Object type mismatch. Expected %s, got %s"),
			*ObjProp->PropertyClass->GetName(), *ReferencedObject->GetClass()->GetName());
		return false;
	}

	ObjProp->SetObjectPropertyValue(ValuePtr, ReferencedObject);
	return true;
}

TSharedPtr<FJsonObject> FMCPTool_Asset::BuildAssetInfoJson(UObject* Asset)
{
	TSharedPtr<FJsonObject> Info = MakeShared<FJsonObject>();

	Info->SetStringField(TEXT("name"), Asset->GetName());
	Info->SetStringField(TEXT("path"), Asset->GetPathName());
	Info->SetStringField(TEXT("class"), Asset->GetClass()->GetName());
	Info->SetStringField(TEXT("package"), Asset->GetOutermost()->GetName());

	UPackage* Package = Asset->GetOutermost();
	Info->SetBoolField(TEXT("is_dirty"), Package->IsDirty());

	if (USkeletalMesh* SkelMesh = Cast<USkeletalMesh>(Asset))
	{
		TArray<TSharedPtr<FJsonValue>> MaterialsArr;
		const TArray<FSkeletalMaterial>& Materials = SkelMesh->GetMaterials();
		for (int32 i = 0; i < Materials.Num(); ++i)
		{
			TSharedPtr<FJsonObject> MatObj = MakeShared<FJsonObject>();
			MatObj->SetNumberField(TEXT("slot"), i);
			MatObj->SetStringField(TEXT("slot_name"), Materials[i].MaterialSlotName.ToString());
			MatObj->SetStringField(TEXT("material"),
				Materials[i].MaterialInterface ? Materials[i].MaterialInterface->GetPathName() : TEXT("None"));
			MaterialsArr.Add(MakeShared<FJsonValueObject>(MatObj));
		}
		Info->SetArrayField(TEXT("materials"), MaterialsArr);
	}

	return Info;
}

TArray<TSharedPtr<FJsonValue>> FMCPTool_Asset::GetAssetProperties(UObject* Asset, bool bEditableOnly)
{
	TArray<TSharedPtr<FJsonValue>> PropsArray;

	for (TFieldIterator<FProperty> PropIt(Asset->GetClass()); PropIt; ++PropIt)
	{
		FProperty* Property = *PropIt;

		if (bEditableOnly && !Property->HasAnyPropertyFlags(CPF_Edit))
		{
			continue;
		}

		TSharedPtr<FJsonObject> PropObj = MakeShared<FJsonObject>();
		PropObj->SetStringField(TEXT("name"), Property->GetName());

		FString TypeStr;
		if (CastField<FNumericProperty>(Property))
		{
			TypeStr = Property->IsA<FFloatProperty>() || Property->IsA<FDoubleProperty>()
				? TEXT("float") : TEXT("integer");
		}
		else if (CastField<FBoolProperty>(Property))
		{
			TypeStr = TEXT("bool");
		}
		else if (CastField<FStrProperty>(Property))
		{
			TypeStr = TEXT("string");
		}
		else if (CastField<FNameProperty>(Property))
		{
			TypeStr = TEXT("name");
		}
		else if (FStructProperty* StructProp = CastField<FStructProperty>(Property))
		{
			TypeStr = FString::Printf(TEXT("struct:%s"), *StructProp->Struct->GetName());
		}
		else if (FObjectProperty* ObjProp = CastField<FObjectProperty>(Property))
		{
			TypeStr = FString::Printf(TEXT("object:%s"), *ObjProp->PropertyClass->GetName());
		}
		else if (FArrayProperty* ArrayProp = CastField<FArrayProperty>(Property))
		{
			TypeStr = TEXT("array");
		}
		else
		{
			TypeStr = TEXT("other");
		}

		PropObj->SetStringField(TEXT("type"), TypeStr);
		PropObj->SetBoolField(TEXT("editable"), Property->HasAnyPropertyFlags(CPF_Edit));

		PropsArray.Add(MakeShared<FJsonValueObject>(PropObj));
	}

	return PropsArray;
}

FMCPToolResult FMCPTool_Asset::ExecuteDuplicateAsset(const TSharedRef<FJsonObject>& Params)
{
	FString SourcePath, DestPath;
	TOptional<FMCPToolResult> Error;

	if (!ExtractRequiredString(Params, TEXT("asset_path"), SourcePath, Error))
	{
		return Error.GetValue();
	}
	if (!ValidateBlueprintPathParam(SourcePath, Error))
	{
		return Error.GetValue();
	}
	if (!ExtractRequiredString(Params, TEXT("destination_path"), DestPath, Error))
	{
		return Error.GetValue();
	}
	if (!ValidateBlueprintPathParam(DestPath, Error))
	{
		return Error.GetValue();
	}

	if (!UEditorAssetLibrary::DoesAssetExist(SourcePath))
	{
		return FMCPToolResult::Error(FString::Printf(TEXT("Source asset does not exist: %s"), *SourcePath));
	}
	if (UEditorAssetLibrary::DoesAssetExist(DestPath))
	{
		return FMCPToolResult::Error(FString::Printf(TEXT("Destination already exists: %s"), *DestPath));
	}

	UObject* Duplicated = UEditorAssetLibrary::DuplicateAsset(SourcePath, DestPath);
	if (!Duplicated)
	{
		return FMCPToolResult::Error(FString::Printf(TEXT("Failed to duplicate '%s' to '%s'"), *SourcePath, *DestPath));
	}

	TSharedPtr<FJsonObject> Data = MakeShared<FJsonObject>();
	Data->SetStringField(TEXT("source_path"), SourcePath);
	Data->SetStringField(TEXT("destination_path"), DestPath);
	Data->SetStringField(TEXT("duplicated_path"), Duplicated->GetPathName());
	return FMCPToolResult::Success(FString::Printf(TEXT("Duplicated to '%s'"), *DestPath), Data);
}

FMCPToolResult FMCPTool_Asset::ExecuteRenameAsset(const TSharedRef<FJsonObject>& Params)
{
	FString SourcePath, NewName;
	TOptional<FMCPToolResult> Error;

	if (!ExtractRequiredString(Params, TEXT("asset_path"), SourcePath, Error))
	{
		return Error.GetValue();
	}
	if (!ValidateBlueprintPathParam(SourcePath, Error))
	{
		return Error.GetValue();
	}
	if (!ExtractRequiredString(Params, TEXT("new_name"), NewName, Error))
	{
		return Error.GetValue();
	}

	// Names must not contain path separators — directs users to 'move' op for cross-directory changes
	if (NewName.Contains(TEXT("/")) || NewName.Contains(TEXT("\\")))
	{
		return FMCPToolResult::Error(TEXT("new_name must be a name only, not a path. Use 'move' to change directory."));
	}

	if (!UEditorAssetLibrary::DoesAssetExist(SourcePath))
	{
		return FMCPToolResult::Error(FString::Printf(TEXT("Source asset does not exist: %s"), *SourcePath));
	}

	const FString DirPath = FPaths::GetPath(SourcePath);
	const FString DestPath = FString::Printf(TEXT("%s/%s"), *DirPath, *NewName);

	if (DestPath == SourcePath)
	{
		return FMCPToolResult::Error(TEXT("new_name is the same as the current name; nothing to rename"));
	}
	if (UEditorAssetLibrary::DoesAssetExist(DestPath))
	{
		return FMCPToolResult::Error(FString::Printf(TEXT("Destination already exists: %s"), *DestPath));
	}

	if (!UEditorAssetLibrary::RenameAsset(SourcePath, DestPath))
	{
		return FMCPToolResult::Error(FString::Printf(TEXT("Failed to rename '%s' to '%s'"), *SourcePath, *NewName));
	}

	TSharedPtr<FJsonObject> Data = MakeShared<FJsonObject>();
	Data->SetStringField(TEXT("source_path"), SourcePath);
	Data->SetStringField(TEXT("destination_path"), DestPath);
	Data->SetStringField(TEXT("new_name"), NewName);
	return FMCPToolResult::Success(FString::Printf(TEXT("Renamed to '%s'"), *NewName), Data);
}

FMCPToolResult FMCPTool_Asset::ExecuteDeleteAsset(const TSharedRef<FJsonObject>& Params)
{
	FString AssetPath;
	TOptional<FMCPToolResult> Error;

	if (!ExtractRequiredString(Params, TEXT("asset_path"), AssetPath, Error))
	{
		return Error.GetValue();
	}
	if (!ValidateBlueprintPathParam(AssetPath, Error))
	{
		return Error.GetValue();
	}

	if (!UEditorAssetLibrary::DoesAssetExist(AssetPath))
	{
		return FMCPToolResult::Error(FString::Printf(TEXT("Asset does not exist: %s"), *AssetPath));
	}

	if (!UEditorAssetLibrary::DeleteAsset(AssetPath))
	{
		return FMCPToolResult::Error(FString::Printf(TEXT("Failed to delete asset: %s"), *AssetPath));
	}

	TSharedPtr<FJsonObject> Data = MakeShared<FJsonObject>();
	Data->SetStringField(TEXT("asset_path"), AssetPath);
	Data->SetBoolField(TEXT("deleted"), true);
	return FMCPToolResult::Success(FString::Printf(TEXT("Deleted asset: %s"), *AssetPath), Data);
}

FMCPToolResult FMCPTool_Asset::ExecuteMoveAsset(const TSharedRef<FJsonObject>& Params)
{
	FString SourcePath;
	TOptional<FMCPToolResult> Error;

	if (!ExtractRequiredString(Params, TEXT("asset_path"), SourcePath, Error))
	{
		return Error.GetValue();
	}
	if (!ValidateBlueprintPathParam(SourcePath, Error))
	{
		return Error.GetValue();
	}

	// Accept destination_path as an alias for destination_directory. `duplicate` uses
	// "destination_path" for a full target path, so users (and LLMs) reach for the same
	// key on `move`. Treated as a directory regardless of value shape; `move` preserves
	// the source asset name by design.
	TArray<FString> Warnings;
	FString DestDir = ExtractOptionalString(Params, TEXT("destination_directory"));
	FString DestPathAlias;
	const bool bAliasPresent = Params->TryGetStringField(TEXT("destination_path"), DestPathAlias) && !DestPathAlias.IsEmpty();
	if (bAliasPresent)
	{
		if (DestDir.IsEmpty())
		{
			DestDir = DestPathAlias;
		}
		Warnings.Add(TEXT("Parameter 'destination_path' is not recognized for 'move' — use 'destination_directory' instead. "
			"Treating value as the destination directory; the source asset name is preserved."));
	}

	// Helper so every early-return error still carries the alias warning — users should
	// hear about wrong param names whether or not the operation succeeded.
	auto WithWarnings = [&Warnings](FMCPToolResult R) -> FMCPToolResult
	{
		R.Warnings = Warnings;
		return R;
	};

	if (DestDir.IsEmpty())
	{
		return WithWarnings(FMCPToolResult::Error(TEXT("Missing required parameter: destination_directory")));
	}
	if (!ValidateBlueprintPathParam(DestDir, Error))
	{
		return WithWarnings(Error.GetValue());
	}

	if (!UEditorAssetLibrary::DoesAssetExist(SourcePath))
	{
		return WithWarnings(FMCPToolResult::Error(FString::Printf(TEXT("Source asset does not exist: %s"), *SourcePath)));
	}

	const FString AssetName = FPaths::GetCleanFilename(SourcePath);
	DestDir.RemoveFromEnd(TEXT("/"));
	const FString DestPath = FString::Printf(TEXT("%s/%s"), *DestDir, *AssetName);

	if (DestPath == SourcePath)
	{
		return WithWarnings(FMCPToolResult::Error(TEXT("destination_directory is the same as source directory; nothing to move")));
	}
	if (UEditorAssetLibrary::DoesAssetExist(DestPath))
	{
		return WithWarnings(FMCPToolResult::Error(FString::Printf(TEXT("Destination already exists: %s"), *DestPath)));
	}

	if (!UEditorAssetLibrary::RenameAsset(SourcePath, DestPath))
	{
		return WithWarnings(FMCPToolResult::Error(FString::Printf(TEXT("Failed to move '%s' to '%s'"), *SourcePath, *DestDir)));
	}

	TSharedPtr<FJsonObject> Data = MakeShared<FJsonObject>();
	Data->SetStringField(TEXT("source_path"), SourcePath);
	Data->SetStringField(TEXT("destination_path"), DestPath);
	Data->SetStringField(TEXT("destination_directory"), DestDir);
	return WithWarnings(FMCPToolResult::Success(FString::Printf(TEXT("Moved to '%s'"), *DestPath), Data));
}

FMCPToolResult FMCPTool_Asset::ExecuteReimportAsset(const TSharedRef<FJsonObject>& Params)
{
	FString AssetPath;
	TOptional<FMCPToolResult> Error;

	if (!ExtractRequiredString(Params, TEXT("asset_path"), AssetPath, Error))
	{
		return Error.GetValue();
	}
	if (!ValidateBlueprintPathParam(AssetPath, Error))
	{
		return Error.GetValue();
	}

	FString LoadError;
	UObject* Asset = LoadAssetByPath(AssetPath, LoadError);
	if (!Asset)
	{
		return FMCPToolResult::Error(LoadError);
	}

	// Reimport with no UI prompts — this runs from MCP, no human at the editor to answer dialogs
	const bool bReimported = FReimportManager::Instance()->Reimport(
		Asset,
		/*bAskForNewFileIfMissing*/ false,
		/*bShowNotification*/ false);

	if (!bReimported)
	{
		return FMCPToolResult::Error(FString::Printf(
			TEXT("Reimport failed for: %s. Asset may have no source file or no registered reimport handler."),
			*AssetPath));
	}

	TSharedPtr<FJsonObject> Data = MakeShared<FJsonObject>();
	Data->SetStringField(TEXT("asset_path"), AssetPath);
	Data->SetBoolField(TEXT("reimported"), true);
	return FMCPToolResult::Success(FString::Printf(TEXT("Reimported asset: %s"), *AssetPath), Data);
}
