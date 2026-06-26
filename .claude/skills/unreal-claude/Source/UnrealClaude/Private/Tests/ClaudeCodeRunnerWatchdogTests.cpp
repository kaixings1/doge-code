// Copyright Natali Caggiano. All Rights Reserved.

/**
 * Unit tests for the Claude CLI silence watchdog logic.
 * Tests the pure formatter and latch transitions without spawning a real subprocess.
 */

#include "CoreMinimal.h"
#include "Misc/AutomationTest.h"
#include "ClaudeCodeRunner.h"

#if WITH_DEV_AUTOMATION_TESTS

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FClaudeCodeRunner_BuildHangDiagnostic_IncludesAllFields,
	"UnrealClaude.SilenceWatchdog.BuildHangDiagnostic.IncludesAllFields",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::ProductFilter
)

bool FClaudeCodeRunner_BuildHangDiagnostic_IncludesAllFields::RunTest(const FString& Parameters)
{
	const FString Payload = TEXT("{\"type\":\"user\",\"message\":{\"role\":\"user\",\"content\":\"hello\"}}");
	const FString Buffer = TEXT("partial-line-no-newline");

	const FString Diagnostic = FClaudeCodeRunner::BuildHangDiagnostic(
		/*SilenceSeconds*/ 62.5,
		/*bProcRunning*/ true,
		Payload,
		Buffer,
		/*Pending*/ 3,
		/*Running*/ 1,
		/*Completed*/ 7);

	TestTrue(TEXT("Contains silence seconds"), Diagnostic.Contains(TEXT("62")));
	TestTrue(TEXT("Contains proc-running status"), Diagnostic.Contains(TEXT("proc_running=true")));
	TestTrue(TEXT("Contains payload byte count"), Diagnostic.Contains(FString::Printf(TEXT("payload_bytes=%d"), Payload.Len())));
	TestTrue(TEXT("Contains MCP queue counts"), Diagnostic.Contains(TEXT("mcp_queue=3/1/7")));
	TestTrue(TEXT("Contains at least some payload content"), Diagnostic.Contains(TEXT("hello")));
	TestTrue(TEXT("Contains buffer preview"), Diagnostic.Contains(TEXT("partial-line-no-newline")));

	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FClaudeCodeRunner_BuildHangDiagnostic_TruncatesLongPayload,
	"UnrealClaude.SilenceWatchdog.BuildHangDiagnostic.TruncatesLongPayload",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::ProductFilter
)

bool FClaudeCodeRunner_BuildHangDiagnostic_TruncatesLongPayload::RunTest(const FString& Parameters)
{
	// 2000-char payload with distinctive head and tail so we can prove both made it
	const FString Head = FString::ChrN(500, TEXT('H'));
	const FString Middle = FString::ChrN(1000, TEXT('M'));
	const FString Tail = FString::ChrN(500, TEXT('T'));
	const FString Payload = Head + Middle + Tail;

	const FString Diagnostic = FClaudeCodeRunner::BuildHangDiagnostic(
		61.0, true, Payload, TEXT(""), 0, 0, 0);

	TestTrue(TEXT("Contains first-500 chars (HHH...)"), Diagnostic.Contains(Head));
	TestTrue(TEXT("Contains last-500 chars (TTT...)"), Diagnostic.Contains(Tail));
	TestFalse(TEXT("Does NOT contain the middle 1000 chars (MMM...)"), Diagnostic.Contains(Middle));
	TestTrue(TEXT("Reports correct byte count"),
		Diagnostic.Contains(FString::Printf(TEXT("payload_bytes=%d"), Payload.Len())));

	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FClaudeCodeRunner_BuildHangDiagnostic_HandlesEmptyPayload,
	"UnrealClaude.SilenceWatchdog.BuildHangDiagnostic.HandlesEmptyPayload",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::ProductFilter
)

bool FClaudeCodeRunner_BuildHangDiagnostic_HandlesEmptyPayload::RunTest(const FString& Parameters)
{
	const FString Diagnostic = FClaudeCodeRunner::BuildHangDiagnostic(
		65.0, false, TEXT(""), TEXT(""), 0, 0, 0);

	TestTrue(TEXT("Empty payload byte count is 0"), Diagnostic.Contains(TEXT("payload_bytes=0")));
	TestTrue(TEXT("proc_running=false surfaced"), Diagnostic.Contains(TEXT("proc_running=false")));
	return true;
}

// Helper: a runner instance we can poke directly. The tests bypass the worker
// thread entirely — they just exercise the latch logic by setting the atomic
// timestamp to known past values and calling the watchdog method.
namespace
{
	/** Set the runner's last-activity time to N seconds in the past. */
	static void SetRunnerSilenceSeconds(FClaudeCodeRunner& Runner, double SilenceSec)
	{
		Runner.TestOnly_SetLastActivityPlatformSeconds(FPlatformTime::Seconds() - SilenceSec);
	}
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FClaudeCodeRunner_Watchdog_NoFireBelowThreshold,
	"UnrealClaude.SilenceWatchdog.Watchdog.NoFireBelowThreshold",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::ProductFilter
)

bool FClaudeCodeRunner_Watchdog_NoFireBelowThreshold::RunTest(const FString& Parameters)
{
	FClaudeCodeRunner Runner;
	Runner.TestOnly_ResetWatchdogLatches();
	SetRunnerSilenceSeconds(Runner, 30.0); // below 60s threshold

	const bool bFired = Runner.TestOnly_MaybeFireSilenceWatchdog(FPlatformTime::Seconds());

	TestFalse(TEXT("Diagnostic not fired below threshold"), bFired);
	TestFalse(TEXT("Banner not latched below threshold"), Runner.IsSilenceWarningActive());
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FClaudeCodeRunner_Watchdog_FiresOnceAboveThreshold,
	"UnrealClaude.SilenceWatchdog.Watchdog.FiresOnceAboveThreshold",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::ProductFilter
)

bool FClaudeCodeRunner_Watchdog_FiresOnceAboveThreshold::RunTest(const FString& Parameters)
{
	FClaudeCodeRunner Runner;
	Runner.TestOnly_ResetWatchdogLatches();
	SetRunnerSilenceSeconds(Runner, 75.0); // above 60s threshold

	const bool bFired1 = Runner.TestOnly_MaybeFireSilenceWatchdog(FPlatformTime::Seconds());
	const bool bFired2 = Runner.TestOnly_MaybeFireSilenceWatchdog(FPlatformTime::Seconds());

	TestTrue(TEXT("Diagnostic fires first crossing"), bFired1);
	TestFalse(TEXT("Diagnostic does not refire on second call (one-shot)"), bFired2);
	TestTrue(TEXT("Banner latched after firing"), Runner.IsSilenceWarningActive());
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FClaudeCodeRunner_Watchdog_BannerRearmsAfterActivity,
	"UnrealClaude.SilenceWatchdog.Watchdog.BannerRearmsAfterActivity",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::ProductFilter
)

bool FClaudeCodeRunner_Watchdog_BannerRearmsAfterActivity::RunTest(const FString& Parameters)
{
	FClaudeCodeRunner Runner;
	Runner.TestOnly_ResetWatchdogLatches();

	// First silence spell: latch banner
	SetRunnerSilenceSeconds(Runner, 75.0);
	Runner.TestOnly_MaybeFireSilenceWatchdog(FPlatformTime::Seconds());
	TestTrue(TEXT("Banner latched"), Runner.IsSilenceWarningActive());

	// Activity arrives → banner clears, diagnostic latch STAYS set
	Runner.TestOnly_CallRecordPipeActivity();
	TestFalse(TEXT("Banner clears on activity"), Runner.IsSilenceWarningActive());

	// Second silence spell: banner relatches, diagnostic does NOT fire again
	SetRunnerSilenceSeconds(Runner, 75.0);
	const bool bFired2 = Runner.TestOnly_MaybeFireSilenceWatchdog(FPlatformTime::Seconds());
	TestFalse(TEXT("Diagnostic stays one-shot across rearm"), bFired2);
	TestTrue(TEXT("Banner re-latches on second silence spell"), Runner.IsSilenceWarningActive());

	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FClaudeCodeRunner_Watchdog_DiagnosticResetsOnLaunch,
	"UnrealClaude.SilenceWatchdog.Watchdog.DiagnosticResetsOnLaunch",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::ProductFilter
)

bool FClaudeCodeRunner_Watchdog_DiagnosticResetsOnLaunch::RunTest(const FString& Parameters)
{
	FClaudeCodeRunner Runner;
	Runner.TestOnly_ResetWatchdogLatches();
	SetRunnerSilenceSeconds(Runner, 75.0);
	Runner.TestOnly_MaybeFireSilenceWatchdog(FPlatformTime::Seconds());

	// Simulate a new subprocess launch — latches must reset
	Runner.TestOnly_ResetWatchdogLatches();

	SetRunnerSilenceSeconds(Runner, 75.0);
	const bool bFiredAfterReset = Runner.TestOnly_MaybeFireSilenceWatchdog(FPlatformTime::Seconds());
	TestTrue(TEXT("Diagnostic fires again after launch reset"), bFiredAfterReset);
	return true;
}

#endif // WITH_DEV_AUTOMATION_TESTS
