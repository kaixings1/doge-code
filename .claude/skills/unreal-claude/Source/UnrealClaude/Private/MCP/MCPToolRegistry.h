// Copyright Natali Caggiano. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "Dom/JsonObject.h"

class FMCPTaskQueue;

/**
 * Tool behavior annotations (hints for LLM clients)
 * These help clients understand tool behavior without being security guarantees
 */
struct FMCPToolAnnotations
{
	/** Tool does not modify its environment (read-only operation) */
	bool bReadOnlyHint = false;

	/** Tool may perform destructive updates (delete, overwrite) */
	bool bDestructiveHint = true;

	/** Repeated calls with same args have no additional effect */
	bool bIdempotentHint = false;

	/** Tool interacts with external entities beyond local environment */
	bool bOpenWorldHint = false;

	FMCPToolAnnotations() = default;

	/** Create read-only tool annotations */
	static FMCPToolAnnotations ReadOnly()
	{
		FMCPToolAnnotations A;
		A.bReadOnlyHint = true;
		A.bDestructiveHint = false;
		A.bIdempotentHint = true;
		A.bOpenWorldHint = false;
		return A;
	}

	/** Create modifying (non-destructive) tool annotations */
	static FMCPToolAnnotations Modifying()
	{
		FMCPToolAnnotations A;
		A.bReadOnlyHint = false;
		A.bDestructiveHint = false;
		A.bIdempotentHint = false;
		A.bOpenWorldHint = false;
		return A;
	}

	/** Create destructive tool annotations */
	static FMCPToolAnnotations Destructive()
	{
		FMCPToolAnnotations A;
		A.bReadOnlyHint = false;
		A.bDestructiveHint = true;
		A.bIdempotentHint = false;
		A.bOpenWorldHint = false;
		return A;
	}

	/** Create destructive tool annotations with message (for documentation) */
	static FMCPToolAnnotations Destructive(const FString& /*WarningMessage*/)
	{
		// Message is for documentation purposes only
		return Destructive();
	}
};

/**
 * Parameter definition for an MCP tool
 */
struct FMCPToolParameter
{
	/** Parameter name */
	FString Name;

	/** Parameter type (string, number, boolean, array, object) */
	FString Type;

	/** Description of the parameter */
	FString Description;

	/** Whether this parameter is required */
	bool bRequired;

	/** Default value if not provided */
	FString DefaultValue;

	FMCPToolParameter()
		: bRequired(false)
	{}

	FMCPToolParameter(const FString& InName, const FString& InType, const FString& InDescription, bool bInRequired = false, const FString& InDefault = TEXT(""))
		: Name(InName)
		, Type(InType)
		, Description(InDescription)
		, bRequired(bInRequired)
		, DefaultValue(InDefault)
	{}
};

/**
 * Information about an MCP tool
 */
struct FMCPToolInfo
{
	/** Unique name of the tool */
	FString Name;

	/** Human-readable description */
	FString Description;

	/** Parameter definitions */
	TArray<FMCPToolParameter> Parameters;

	/** Behavioral annotations/hints for LLM clients */
	FMCPToolAnnotations Annotations;
};

/**
 * Tool result content type — mirrors the MCP 2025-06-18 content block taxonomy.
 * Tools default to Text; capture-style tools opt into Image; Audio and
 * StructuredContent are reserved for future use (enum values declared so
 * we don't have to bump the API surface when the first consumer lands).
 */
enum class EMCPToolResultType : uint8
{
	/** Plain text payload (the default — Message + stringified Data). */
	Text = 0,
	/** Base64-encoded image. Bridge emits a native MCP image content block. */
	Image,
	/** Base64-encoded audio. Reserved — bridge falls back to text path until a consumer lands. */
	Audio,
	/** Top-level structured JSON payload. Reserved — bridge falls back to text path. */
	StructuredContent
};

/** Stable lowercase serialization matching MCP spec content-block "type" values. */
inline const TCHAR* MCPToolResultTypeToString(EMCPToolResultType InType)
{
	switch (InType)
	{
	case EMCPToolResultType::Image:             return TEXT("image");
	case EMCPToolResultType::Audio:             return TEXT("audio");
	case EMCPToolResultType::StructuredContent: return TEXT("structured");
	case EMCPToolResultType::Text:              // fallthrough
	default:                                    return TEXT("text");
	}
}

/**
 * Result from executing an MCP tool.
 *
 * Defaults to Text content (Message + stringified Data). Tools that produce
 * non-text payloads should use the typed factories (FMCPToolResult::Image)
 * instead of stuffing the payload into Data — that keeps the C++ side
 * authoritative about the content type rather than requiring the bridge to
 * string-match on toolName.
 */
struct FMCPToolResult
{
	/** Whether the operation succeeded */
	bool bSuccess;

	/** Human-readable message */
	FString Message;

	/** Optional structured data result */
	TSharedPtr<FJsonObject> Data;

	/** Optional non-fatal warnings (e.g. unknown/deprecated parameter names) */
	TArray<FString> Warnings;

	/** Content type hint for the response formatter (default Text). */
	EMCPToolResultType ContentType = EMCPToolResultType::Text;

	/** MIME type for Image/Audio payloads (e.g. "image/jpeg"). Ignored for Text/StructuredContent. */
	FString MimeType;

	/** Base64-encoded binary payload for Image/Audio. Ignored for Text/StructuredContent. */
	FString Base64Payload;

	FMCPToolResult()
		: bSuccess(false)
	{}

	static FMCPToolResult Success(const FString& InMessage, TSharedPtr<FJsonObject> InData = nullptr)
	{
		FMCPToolResult Result;
		Result.bSuccess = true;
		Result.Message = InMessage;
		Result.Data = InData;
		return Result;
	}

	static FMCPToolResult Error(const FString& InMessage)
	{
		FMCPToolResult Result;
		Result.bSuccess = false;
		Result.Message = InMessage;
		return Result;
	}

	/**
	 * Image content factory. The bridge will emit a native MCP image content
	 * block ({type:"image", data:<base64>, mimeType:...}) plus a separate text
	 * block carrying Message and the metadata Data object (without re-emitting
	 * the base64 payload).
	 *
	 * @param InBase64    Base64-encoded image bytes (without data: URI prefix).
	 * @param InMimeType  MIME type, e.g. "image/jpeg" or "image/png".
	 * @param InMessage   Optional human-readable caption / status line.
	 * @param InData      Optional metadata sidecar (width, height, viewport_type, etc.).
	 */
	static FMCPToolResult Image(const FString& InBase64, const FString& InMimeType,
		const FString& InMessage = FString(), TSharedPtr<FJsonObject> InData = nullptr)
	{
		FMCPToolResult Result;
		Result.bSuccess = true;
		Result.Message = InMessage;
		Result.Data = InData;
		Result.ContentType = EMCPToolResultType::Image;
		Result.MimeType = InMimeType;
		Result.Base64Payload = InBase64;
		return Result;
	}
};

/**
 * Base class for MCP tools
 */
class IMCPTool
{
public:
	virtual ~IMCPTool() = default;

	/** Get tool info (name, description, parameters) */
	virtual FMCPToolInfo GetInfo() const = 0;

	/** Execute the tool with given parameters */
	virtual FMCPToolResult Execute(const TSharedRef<FJsonObject>& Params) = 0;
};

/**
 * Registry for managing MCP tools
 */
class FMCPToolRegistry
{
public:
	FMCPToolRegistry();
	~FMCPToolRegistry();

	/** Register a tool */
	void RegisterTool(TSharedPtr<IMCPTool> Tool);

	/** Unregister a tool by name */
	void UnregisterTool(const FString& ToolName);

	/** Get all registered tools */
	TArray<FMCPToolInfo> GetAllTools() const;

	/** Execute a tool by name */
	FMCPToolResult ExecuteTool(const FString& ToolName, const TSharedRef<FJsonObject>& Params);

	/** Check if a tool exists */
	bool HasTool(const FString& ToolName) const;

	/** Find a tool by name (returns nullptr if not found) */
	IMCPTool* FindTool(const FString& ToolName) const
	{
		const TSharedPtr<IMCPTool>* Found = Tools.Find(ToolName);
		return Found && Found->IsValid() ? Found->Get() : nullptr;
	}

	/** Get the async task queue */
	TSharedPtr<FMCPTaskQueue> GetTaskQueue() const { return TaskQueue; }

	/** Start the async task queue (call after construction) */
	void StartTaskQueue();

	/** Stop the async task queue (call before destruction) */
	void StopTaskQueue();

private:
	/** Register all built-in tools */
	void RegisterBuiltinTools();

	/** Invalidate cached tool list */
	void InvalidateToolCache();

	/** Map of tool name to tool instance */
	TMap<FString, TSharedPtr<IMCPTool>> Tools;

	/** Cached tool info list for performance */
	mutable TArray<FMCPToolInfo> CachedToolInfo;

	/** Whether the cached tool list is valid */
	mutable bool bCacheValid = false;

	/** Async task queue for long-running operations */
	TSharedPtr<FMCPTaskQueue> TaskQueue;
};
