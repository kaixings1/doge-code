// Copyright Natali Caggiano. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "Dom/JsonObject.h"

struct FMCPToolResult;

namespace UnrealClaude::MCP
{
	/**
	 * Build the JSON envelope returned by POST /mcp/tool/{name} from an
	 * FMCPToolResult. Caller is responsible for HTTP-level concerns
	 * (status code, headers, serialization to string).
	 *
	 * Envelope shape:
	 *   {
	 *     "success":     bool,
	 *     "isError":     bool                          // canonical MCP 2025-06-18 field
	 *     "message":     string,
	 *     "data":        object (optional),
	 *     "warnings":    [string] (optional),
	 *     "contentType": "text" | "image" | "audio" | "structured",
	 *     "mimeType":    string (only when contentType is image/audio),
	 *     "base64":      string (only when contentType is image/audio)
	 *   }
	 *
	 * For backward compatibility with bridge versions that special-cased
	 * capture_viewport via `data.image_base64`, image results also emit
	 * the legacy `data.image_base64` field as a deprecation grace period.
	 */
	TSharedPtr<FJsonObject> BuildToolResultJson(const FMCPToolResult& Result);

	/**
	 * Build the JSON envelope returned by HTTP-level error responses
	 * (bad tool name, oversized body, malformed JSON body).
	 *
	 * Envelope shape:
	 *   {
	 *     "success": false,
	 *     "isError": true,
	 *     "message": string,
	 *     "error":   string   // deprecated alias of "message", retained for one release
	 *   }
	 */
	TSharedPtr<FJsonObject> BuildErrorEnvelopeJson(const FString& Message);
}
