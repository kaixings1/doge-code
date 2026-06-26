// Copyright Natali Caggiano. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "IClaudeRunner.h"
#include "HAL/Runnable.h"
#include "HAL/RunnableThread.h"
#include "HAL/PlatformProcess.h"
#include "HAL/PlatformTime.h"
#include "Templates/Atomic.h"

/**
 * Async runner for Claude Code CLI commands (cross-platform implementation)
 * Executes 'claude -p' in print mode and captures output
 * Implements IClaudeRunner interface for abstraction
 */
class UNREALCLAUDE_API FClaudeCodeRunner : public IClaudeRunner, public FRunnable
{
public:
	FClaudeCodeRunner();
	virtual ~FClaudeCodeRunner();

	virtual bool ExecuteAsync(
		const FClaudeRequestConfig& Config,
		FOnClaudeResponse OnComplete,
		FOnClaudeProgress OnProgress = FOnClaudeProgress()
	) override;

	virtual bool ExecuteSync(const FClaudeRequestConfig& Config, FString& OutResponse) override;
	virtual void Cancel() override;
	virtual bool IsExecuting() const override { return bIsExecuting; }
	virtual bool IsAvailable() const override { return IsClaudeAvailable(); }
	virtual double GetSilenceSeconds() const override;
	virtual bool IsSilenceWarningActive() const override;

	/** Check if Claude CLI is available on this system (static for backward compatibility) */
	static bool IsClaudeAvailable();

	/** Get the Claude CLI path */
	static FString GetClaudePath();

	virtual bool Init() override;
	virtual uint32 Run() override;
	virtual void Stop() override;
	virtual void Exit() override;

	/** Build stream-json NDJSON payload with text + base64 image content blocks */
	FString BuildStreamJsonPayload(const FString& TextPrompt, const TArray<FString>& ImagePaths);

	/** Parse stream-json NDJSON output to extract the response text */
	FString ParseStreamJsonOutput(const FString& RawOutput);

private:
	FString BuildCommandLine(const FClaudeRequestConfig& Config);
	void ExecuteProcess();
	void CleanupHandles();

	/** Parse a single NDJSON line and emit structured events */
	void ParseAndEmitNdjsonLine(const FString& JsonLine);

	/** Buffer for accumulating incomplete NDJSON lines across read chunks */
	FString NdjsonLineBuffer;

	/** Cached stream-json payload last written to stdin; used for watchdog diagnostics. */
	FString LastStdinPayload;

	/** Accumulated text from assistant messages for the final response */
	FString AccumulatedResponseText;

	/** Create pipes for process stdout/stderr capture */
	bool CreateProcessPipes();

	/** Launch the Claude process with given command */
	bool LaunchProcess(const FString& FullCommand, const FString& WorkingDir);

	/** Read output from process until completion or cancellation */
	FString ReadProcessOutput();

	/** Report error to callback on game thread */
	void ReportError(const FString& ErrorMessage);

	/** Report completion to callback on game thread */
	void ReportCompletion(const FString& Output, bool bSuccess);

	FClaudeRequestConfig CurrentConfig;
	FOnClaudeResponse OnCompleteDelegate;
	FOnClaudeProgress OnProgressDelegate;

	FRunnableThread* Thread;
	FThreadSafeCounter StopTaskCounter;
	TAtomic<bool> bIsExecuting;
	TAtomic<bool> bRefusalDetected{false};

	/** Monotonic process-relative milliseconds (from FPlatformTime::Seconds() * 1000) of the last byte received on the child stdout pipe. Updated on bytes received. */
	TAtomic<int64> LastPipeActivityMillis{0};

	/** Banner latch: true while silence has crossed threshold, cleared on next bytes received. Widget reads this. */
	TAtomic<bool> bSilenceBannerLatched{false};

	/** Diagnostic latch: one-shot per session, prevents UE_LOG spam if silence alternates. Cleared only at launch. */
	TAtomic<bool> bHangDiagnosticLogged{false};

public:
	/** Check if the last execution was refused by streaming safety classifiers */
	bool WasRefused() const { return bRefusalDetected.Load(); }

	/** Build the hang diagnostic string. Pure function so it is unit-testable. */
	static FString BuildHangDiagnostic(
		double SilenceSeconds,
		bool bProcRunning,
		const FString& StdinPayload,
		const FString& NdjsonLineBufferSnapshot,
		int32 TaskQueuePending,
		int32 TaskQueueRunning,
		int32 TaskQueueCompleted);

#if WITH_DEV_AUTOMATION_TESTS
	/** Test-only: set the last-activity timestamp directly in FPlatformTime::Seconds() units. */
	void TestOnly_SetLastActivityPlatformSeconds(double PlatformSeconds)
	{
		LastPipeActivityMillis.Store(static_cast<int64>(PlatformSeconds * 1000.0));
	}

	/** Test-only: reset both watchdog latches as if a fresh subprocess were launched. */
	void TestOnly_ResetWatchdogLatches()
	{
		bSilenceBannerLatched.Store(false);
		bHangDiagnosticLogged.Store(false);
		LastPipeActivityMillis.Store(static_cast<int64>(FPlatformTime::Seconds() * 1000.0));
	}

	/** Test-only: expose the private RecordPipeActivity for latch-rearm tests. */
	void TestOnly_CallRecordPipeActivity()
	{
		RecordPipeActivity();
	}

	/** Test-only: expose MaybeFireSilenceWatchdog. */
	bool TestOnly_MaybeFireSilenceWatchdog(double NowPlatformSeconds)
	{
		return MaybeFireSilenceWatchdog(NowPlatformSeconds);
	}
#endif

private:

	// FProcHandle stored as void* for atomic exchange compatibility
	FProcHandle ProcessHandle;

	void* ReadPipe;
	void* WritePipe;
	void* StdInReadPipe;
	void* StdInWritePipe;

	// Temp file paths for prompts (to avoid command line length limits)
	FString SystemPromptFilePath;
	FString PromptFilePath;

	/** Seconds of zero pipe activity before the watchdog fires the banner and diagnostic. */
	static constexpr double SilenceWarningThresholdSeconds = 60.0;

	/** Record pipe activity. Thread-safe; may be called from the worker thread. */
	void RecordPipeActivity();

	/** Evaluate silence and latch the banner/diagnostic as appropriate. Returns true if the diagnostic was logged this call. */
	bool MaybeFireSilenceWatchdog(double NowPlatformSeconds);
};
