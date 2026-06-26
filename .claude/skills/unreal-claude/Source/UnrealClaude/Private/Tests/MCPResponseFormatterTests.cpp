// Copyright Natali Caggiano. All Rights Reserved.

/**
 * Unit tests for UnrealClaude::MCP response formatter helpers
 * (BuildToolResultJson + BuildErrorEnvelopeJson).
 *
 * Asserts the JSON envelope shape returned by POST /mcp/tool/{name} for
 * each FMCPToolResult content type, plus the dedicated HTTP-level error
 * envelope. Locks in the contract the bridge depends on.
 */

#include "CoreMinimal.h"
#include "Misc/AutomationTest.h"
#include "Dom/JsonObject.h"
#include "MCP/MCPResponseFormatter.h"
#include "MCP/MCPToolRegistry.h"

#if WITH_DEV_AUTOMATION_TESTS

BEGIN_DEFINE_SPEC(
	FMCPResponseFormatterSpec,
	"UnrealClaude.MCP.ResponseFormatter",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::ProductFilter)
END_DEFINE_SPEC(FMCPResponseFormatterSpec)

void FMCPResponseFormatterSpec::Define()
{
	using namespace UnrealClaude::MCP;

	Describe(TEXT("BuildToolResultJson"), [this]()
	{
		Describe(TEXT("success result"), [this]()
		{
			It("emits success=true and isError=false", [this]()
			{
				const FMCPToolResult Result = FMCPToolResult::Success(TEXT("ok"));
				const TSharedPtr<FJsonObject> Json = BuildToolResultJson(Result);
				bool bSuccess = false, bIsError = true;
				TestTrue(TEXT("success field present"), Json->TryGetBoolField(TEXT("success"), bSuccess));
				TestTrue(TEXT("isError field present"), Json->TryGetBoolField(TEXT("isError"), bIsError));
				TestTrue(TEXT("success == true"), bSuccess);
				TestFalse(TEXT("isError == false"), bIsError);
			});

			It("emits the message field", [this]()
			{
				const FMCPToolResult Result = FMCPToolResult::Success(TEXT("operation complete"));
				const TSharedPtr<FJsonObject> Json = BuildToolResultJson(Result);
				FString Message;
				TestTrue(TEXT("message field present"), Json->TryGetStringField(TEXT("message"), Message));
				TestEqual(TEXT("message round-trip"), Message, TEXT("operation complete"));
			});

			It("defaults contentType to \"text\"", [this]()
			{
				const FMCPToolResult Result = FMCPToolResult::Success(TEXT("ok"));
				const TSharedPtr<FJsonObject> Json = BuildToolResultJson(Result);
				FString ContentType;
				TestTrue(TEXT("contentType field present"), Json->TryGetStringField(TEXT("contentType"), ContentType));
				TestEqual(TEXT("contentType defaults to text"), ContentType, TEXT("text"));
			});

			It("omits mimeType and base64 for text results", [this]()
			{
				const FMCPToolResult Result = FMCPToolResult::Success(TEXT("ok"));
				const TSharedPtr<FJsonObject> Json = BuildToolResultJson(Result);
				TestFalse(TEXT("no mimeType on text result"), Json->HasField(TEXT("mimeType")));
				TestFalse(TEXT("no base64 on text result"), Json->HasField(TEXT("base64")));
			});

			It("includes the optional data object when provided", [this]()
			{
				const TSharedPtr<FJsonObject> Data = MakeShared<FJsonObject>();
				Data->SetStringField(TEXT("actor_name"), TEXT("BP_Enemy_42"));
				const FMCPToolResult Result = FMCPToolResult::Success(TEXT("spawned"), Data);
				const TSharedPtr<FJsonObject> Json = BuildToolResultJson(Result);
				const TSharedPtr<FJsonObject>* DataField = nullptr;
				TestTrue(TEXT("data field present"), Json->TryGetObjectField(TEXT("data"), DataField));
				FString ActorName;
				TestTrue(TEXT("data.actor_name present"), (*DataField)->TryGetStringField(TEXT("actor_name"), ActorName));
				TestEqual(TEXT("data.actor_name round-trip"), ActorName, TEXT("BP_Enemy_42"));
			});

			It("emits warnings array when warnings are present", [this]()
			{
				FMCPToolResult Result = FMCPToolResult::Success(TEXT("ok"));
				Result.Warnings.Add(TEXT("deprecated param: asset_type"));
				const TSharedPtr<FJsonObject> Json = BuildToolResultJson(Result);
				const TArray<TSharedPtr<FJsonValue>>* Warnings = nullptr;
				TestTrue(TEXT("warnings array present"), Json->TryGetArrayField(TEXT("warnings"), Warnings));
				TestEqual(TEXT("one warning"), Warnings->Num(), 1);
				TestEqual(TEXT("warning round-trip"),
					(*Warnings)[0]->AsString(), TEXT("deprecated param: asset_type"));
			});

			It("omits warnings field when none are present", [this]()
			{
				const FMCPToolResult Result = FMCPToolResult::Success(TEXT("ok"));
				const TSharedPtr<FJsonObject> Json = BuildToolResultJson(Result);
				TestFalse(TEXT("no warnings field"), Json->HasField(TEXT("warnings")));
			});
		});

		Describe(TEXT("error result"), [this]()
		{
			It("emits success=false and isError=true", [this]()
			{
				const FMCPToolResult Result = FMCPToolResult::Error(TEXT("something broke"));
				const TSharedPtr<FJsonObject> Json = BuildToolResultJson(Result);
				bool bSuccess = true, bIsError = false;
				Json->TryGetBoolField(TEXT("success"), bSuccess);
				Json->TryGetBoolField(TEXT("isError"), bIsError);
				TestFalse(TEXT("success == false"), bSuccess);
				TestTrue(TEXT("isError == true"), bIsError);
			});

			It("preserves the error message", [this]()
			{
				const FMCPToolResult Result = FMCPToolResult::Error(TEXT("class not found: BogusActor"));
				const TSharedPtr<FJsonObject> Json = BuildToolResultJson(Result);
				FString Message;
				Json->TryGetStringField(TEXT("message"), Message);
				TestEqual(TEXT("message round-trip"), Message, TEXT("class not found: BogusActor"));
			});
		});

		Describe(TEXT("image result"), [this]()
		{
			It("emits contentType=\"image\"", [this]()
			{
				const FMCPToolResult Result = FMCPToolResult::Image(
					TEXT("ZmFrZS1pbWFnZS1ieXRlcw=="), TEXT("image/png"));
				const TSharedPtr<FJsonObject> Json = BuildToolResultJson(Result);
				FString ContentType;
				Json->TryGetStringField(TEXT("contentType"), ContentType);
				TestEqual(TEXT("contentType=image"), ContentType, TEXT("image"));
			});

			It("emits mimeType and base64 at top level", [this]()
			{
				const FMCPToolResult Result = FMCPToolResult::Image(
					TEXT("ZmFrZS1pbWFnZS1ieXRlcw=="), TEXT("image/jpeg"));
				const TSharedPtr<FJsonObject> Json = BuildToolResultJson(Result);
				FString MimeType, Base64;
				TestTrue(TEXT("mimeType field present"), Json->TryGetStringField(TEXT("mimeType"), MimeType));
				TestTrue(TEXT("base64 field present"), Json->TryGetStringField(TEXT("base64"), Base64));
				TestEqual(TEXT("mimeType round-trip"), MimeType, TEXT("image/jpeg"));
				TestEqual(TEXT("base64 round-trip"), Base64, TEXT("ZmFrZS1pbWFnZS1ieXRlcw=="));
			});

			It("mirrors base64 into data.image_base64 for backward compat", [this]()
			{
				const FMCPToolResult Result = FMCPToolResult::Image(
					TEXT("Zg=="), TEXT("image/jpeg"));
				const TSharedPtr<FJsonObject> Json = BuildToolResultJson(Result);
				const TSharedPtr<FJsonObject>* DataField = nullptr;
				TestTrue(TEXT("data field present"), Json->TryGetObjectField(TEXT("data"), DataField));
				FString LegacyBase64;
				TestTrue(TEXT("data.image_base64 mirrored"),
					(*DataField)->TryGetStringField(TEXT("image_base64"), LegacyBase64));
				TestEqual(TEXT("data.image_base64 matches top-level"), LegacyBase64, TEXT("Zg=="));
			});

			It("preserves metadata sidecar data alongside the legacy image_base64 mirror", [this]()
			{
				const TSharedPtr<FJsonObject> Meta = MakeShared<FJsonObject>();
				Meta->SetNumberField(TEXT("width"), 1024);
				Meta->SetNumberField(TEXT("height"), 576);
				const FMCPToolResult Result = FMCPToolResult::Image(
					TEXT("Zg=="), TEXT("image/jpeg"), TEXT("captured"), Meta);
				const TSharedPtr<FJsonObject> Json = BuildToolResultJson(Result);
				const TSharedPtr<FJsonObject>* DataField = nullptr;
				Json->TryGetObjectField(TEXT("data"), DataField);
				double Width = 0.0;
				TestTrue(TEXT("data.width preserved"), (*DataField)->TryGetNumberField(TEXT("width"), Width));
				TestEqual(TEXT("data.width round-trip"), Width, 1024.0);
				TestTrue(TEXT("data.image_base64 still mirrored"),
					(*DataField)->HasField(TEXT("image_base64")));
			});
		});
	});

	Describe(TEXT("BuildErrorEnvelopeJson"), [this]()
	{
		It("emits success=false and isError=true", [this]()
		{
			const TSharedPtr<FJsonObject> Json = BuildErrorEnvelopeJson(TEXT("bad request"));
			bool bSuccess = true, bIsError = false;
			Json->TryGetBoolField(TEXT("success"), bSuccess);
			Json->TryGetBoolField(TEXT("isError"), bIsError);
			TestFalse(TEXT("success == false"), bSuccess);
			TestTrue(TEXT("isError == true"), bIsError);
		});

		It("emits the message field", [this]()
		{
			const TSharedPtr<FJsonObject> Json = BuildErrorEnvelopeJson(TEXT("tool name not specified"));
			FString Message;
			Json->TryGetStringField(TEXT("message"), Message);
			TestEqual(TEXT("message round-trip"), Message, TEXT("tool name not specified"));
		});

		It("emits the deprecated error alias matching message", [this]()
		{
			const TSharedPtr<FJsonObject> Json = BuildErrorEnvelopeJson(TEXT("invalid JSON body"));
			FString Message, Error;
			Json->TryGetStringField(TEXT("message"), Message);
			Json->TryGetStringField(TEXT("error"), Error);
			TestEqual(TEXT("error alias matches message"), Error, Message);
		});
	});
}

#endif // WITH_DEV_AUTOMATION_TESTS
