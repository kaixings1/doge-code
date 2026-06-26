// Copyright Natali Caggiano. All Rights Reserved.

#include "MCPResponseFormatter.h"
#include "MCPToolRegistry.h"

namespace UnrealClaude::MCP
{
	TSharedPtr<FJsonObject> BuildToolResultJson(const FMCPToolResult& Result)
	{
		TSharedPtr<FJsonObject> Json = MakeShared<FJsonObject>();

		// Canonical MCP 2025-06-18 fields + legacy `success` for bridge compatibility.
		Json->SetBoolField(TEXT("success"), Result.bSuccess);
		Json->SetBoolField(TEXT("isError"), !Result.bSuccess);
		Json->SetStringField(TEXT("message"), Result.Message);

		Json->SetStringField(TEXT("contentType"), MCPToolResultTypeToString(Result.ContentType));

		// Binary payload + MIME type only meaningful for Image/Audio.
		if (Result.ContentType == EMCPToolResultType::Image ||
			Result.ContentType == EMCPToolResultType::Audio)
		{
			if (!Result.MimeType.IsEmpty())
			{
				Json->SetStringField(TEXT("mimeType"), Result.MimeType);
			}
			if (!Result.Base64Payload.IsEmpty())
			{
				Json->SetStringField(TEXT("base64"), Result.Base64Payload);
			}
		}

		if (Result.Data.IsValid())
		{
			Json->SetObjectField(TEXT("data"), Result.Data);
		}

		// Backward-compat shim: older bridge versions detect capture_viewport
		// images via `data.image_base64`. Emit it alongside the canonical
		// `base64` field for one release so old bridges keep working with
		// new plugins. Bridges that understand `contentType` ignore this.
		if (Result.ContentType == EMCPToolResultType::Image &&
			!Result.Base64Payload.IsEmpty())
		{
			TSharedPtr<FJsonObject> DataForLegacy = Result.Data.IsValid()
				? Result.Data
				: MakeShared<FJsonObject>();
			if (!DataForLegacy->HasField(TEXT("image_base64")))
			{
				DataForLegacy->SetStringField(TEXT("image_base64"), Result.Base64Payload);
			}
			Json->SetObjectField(TEXT("data"), DataForLegacy);
		}

		if (Result.Warnings.Num() > 0)
		{
			TArray<TSharedPtr<FJsonValue>> WarningsJson;
			WarningsJson.Reserve(Result.Warnings.Num());
			for (const FString& Warning : Result.Warnings)
			{
				WarningsJson.Add(MakeShared<FJsonValueString>(Warning));
			}
			Json->SetArrayField(TEXT("warnings"), WarningsJson);
		}

		return Json;
	}

	TSharedPtr<FJsonObject> BuildErrorEnvelopeJson(const FString& Message)
	{
		TSharedPtr<FJsonObject> Json = MakeShared<FJsonObject>();
		Json->SetBoolField(TEXT("success"), false);
		Json->SetBoolField(TEXT("isError"), true);
		Json->SetStringField(TEXT("message"), Message);
		// `error` is a deprecated alias retained for one release; the bridge
		// has always read `message`. Direct HTTP consumers that read `error`
		// keep working.
		Json->SetStringField(TEXT("error"), Message);
		return Json;
	}
}
