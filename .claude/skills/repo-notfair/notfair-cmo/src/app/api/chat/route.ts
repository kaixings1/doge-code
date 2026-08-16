import { NextResponse } from "next/server";
import { getActiveProject } from "@/server/active-project";
import { getProject } from "@/server/db/projects";
import { resolveAgentBySlug } from "@/server/agent-meta";
import { requireAdapter } from "@/server/adapters/registry";
import { workspaceDirFor } from "@/server/agents/provisioning";
import {
  getOrCreateSession,
  appendTranscriptEvent,
  touchSession,
} from "@/server/sessions";
import { claimProposedTask, getTask, updateTask } from "@/server/db/tasks";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ChatPostBody = {
  message: string;
  agent?: string;
  /** URL slug of the project this chat belongs to. */
  project?: string;
  /**
   * Thread label — stable identifier for the chat thread. The route maps
   * (project, agent, label) → a sessions row; if none exists it's created.
   * Clients pass the URL thread UUID here (or via `sessionId` for
   * backward-compat with the live-transcript composer). Defaults to "main"
   * only when the caller supplies neither field.
   */
  thread?: string;
  sessionId?: string;
  /** Legacy from the OpenClaw composer; ignored, kept for body schema compat. */
  sessionKey?: string;
  /**
   * When set, this turn is a task kickoff: atomically claim the task
   * (proposed → working) before forwarding. Concurrent kickoffs / reloads
   * mid-run are rejected with 409.
   */
  task_id?: string;
};

export async function POST(request: Request) {
  let body: ChatPostBody;
  try {
    body = (await request.json()) as ChatPostBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body?.message?.trim()) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  const project = body.project ? getProject(body.project) : await getActiveProject();
  if (!project) {
    return NextResponse.json(
      { error: "No active project. Create one first." },
      { status: 400 },
    );
  }

  const requestedSlug = (body.agent ?? "cmo").trim();
  const resolved = await resolveAgentBySlug(project.slug, requestedSlug);
  if (!resolved) {
    return NextResponse.json(
      { error: `Unknown agent: '${requestedSlug}'` },
      { status: 404 },
    );
  }

  const taskId = body.task_id?.trim();
  if (taskId) {
    const existing = getTask(taskId);
    if (!existing) {
      return NextResponse.json({ error: `Unknown task_id '${taskId}'` }, { status: 404 });
    }
    if (existing.agent_id !== resolved.agent_id) {
      return NextResponse.json(
        {
          error: `Task ${existing.display_id} belongs to ${existing.agent_id}, not ${resolved.agent_id}`,
        },
        { status: 400 },
      );
    }
    const claimed = claimProposedTask(existing.id);
    if (!claimed) {
      return NextResponse.json(
        { error: "task already claimed", status: existing.status, task_id: existing.id },
        { status: 409 },
      );
    }
  }

  const label =
    body.thread?.trim() || body.sessionId?.trim() || "main";
  const session = getOrCreateSession({
    project_slug: project.slug,
    agent_id: resolved.agent_id,
    label,
    harness_adapter: project.harness_adapter,
    task_id: taskId ?? null,
  });
  appendTranscriptEvent(session.id, "user", { text: body.message });

  const adapter = requireAdapter(project.harness_adapter);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let clientOpen = true;
      const send = (event: string, data: unknown) => {
        if (!clientOpen) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        } catch {
          clientOpen = false;
        }
      };

      // Disconnect != cancel: the harness keeps running and persisting events
      // to the transcript. The user sees them on next attach.
      const noAbort = new AbortController();

      try {
        send("meta", {
          project_slug: project.slug,
          agent: resolved.agent_id,
          session_id: session.id,
          harness_adapter: project.harness_adapter,
          message_chars: body.message.length,
          is_kickoff: Boolean(taskId),
        });

        for await (const evt of adapter.execute({
          projectSlug: project.slug,
          agentId: resolved.agent_id,
          workspaceDir: workspaceDirFor(resolved.agent_id),
          message: body.message,
          threadId: session.id,
          harnessSessionId: session.harness_session_id,
          signal: noAbort.signal,
        })) {
          if (evt.kind === "session") {
            // Remember the harness's own session id so the next turn can
            // pass it back via --resume / `exec resume`. Don't persist as
            // a transcript event — it's metadata, not chat content.
            touchSession(session.id, evt.harnessSessionId);
            continue;
          }
          try {
            appendTranscriptEvent(session.id, evt.kind, evt);
          } catch (err) {
            console.error("[api/chat] transcript persist failed:", err);
          }

          if (evt.kind === "delta") {
            send("text", { chunk: evt.text });
          } else if (evt.kind === "tool") {
            send("tool", {
              phase: evt.phase,
              tool_call_id: evt.toolCallId,
              name: evt.name,
              label: evt.label,
            });
          } else if (evt.kind === "lifecycle") {
            send("lifecycle", { phase: evt.phase });
          } else if (evt.kind === "error") {
            send("error", { message: evt.message });
            if (taskId) {
              updateTask(taskId, { status: "failed", error_message: evt.message });
            }
          }
        }

        touchSession(session.id);

        // Detect abandoned task kickoffs / follow-ups: the harness turn
        // ended cleanly but the agent didn't call submit_task_status, so
        // the task is still in `working` and would otherwise stay
        // stuck forever. Flip to `blocked` with a clear reason so the
        // UI can recover and the user can choose what to do.
        if (taskId) {
          const current = getTask(taskId);
          if (current && current.status === "working") {
            updateTask(taskId, {
              status: "blocked",
              error_message:
                "Agent finished its turn without calling submit_task_status. The task is parked — send a follow-up message or mark it done manually.",
            });
            send("error", {
              message:
                "Turn ended without submit_task_status. Task moved to blocked.",
            });
          }
        }

        send("done", {});
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        send("error", { message });
        if (taskId) {
          updateTask(taskId, { status: "failed", error_message: message });
        }
      } finally {
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
