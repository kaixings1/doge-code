"use server";

import { revalidatePath } from "next/cache";
import {
  createCron,
  disableCron,
  enableCron,
  invalidateCronCache,
  removeCron,
} from "@/server/scheduler/display";
import { getDb } from "@/server/db/db";
import { type AgentTemplate } from "@/server/agent-templates";
import { listProjectAgents } from "@/server/agent-meta";
import { slugify } from "@/lib/slug";
import { logAgentAction } from "@/server/db/agent-actions";

export type ScheduleCronInput = {
  project_slug: string;
  specialist: AgentTemplate["key"];
  name: string;
  schedule_kind: "cron";
  schedule_value: string;
  tz?: string;
  brief: string;
};

export type ScheduleCronResult =
  | { ok: true; cron_id: string; cron_name: string }
  | { ok: false; error: string };

export async function scheduleCronAction(input: ScheduleCronInput): Promise<ScheduleCronResult> {
  const nameSlug = slugify(input.name);
  if (!nameSlug.ok) return { ok: false, error: `Invalid name: ${nameSlug.reason}` };

  const briefTrimmed = input.brief.trim();
  if (!briefTrimmed) return { ok: false, error: "Brief is required." };

  const scheduleValueTrimmed = input.schedule_value.trim();
  if (!scheduleValueTrimmed) return { ok: false, error: "Schedule is required." };

  // Look up the agent's actual id/slug from the project — agent_ids now
  // encode the personal name (e.g. `demo3-cmo-greg`) so we can't
  // synthesize them from the template key alone.
  const projectAgents = await listProjectAgents(input.project_slug);
  const target = projectAgents.find((a) => a.template_key === input.specialist);
  if (!target) {
    return {
      ok: false,
      error: `No '${input.specialist}' agent found in project ${input.project_slug}.`,
    };
  }
  const agent_slug = target.slug;
  const agent_full_id = target.agent_id;

  try {
    const result = await createCron({
      project_slug: input.project_slug,
      agent_slug,
      agent_full_id,
      cron_name: nameSlug.slug,
      schedule: { kind: "cron", expr: scheduleValueTrimmed, tz: input.tz },
      message: briefTrimmed,
    });
    logAgentAction({
      project_slug: input.project_slug,
      agent_id: agent_full_id,
      action_type: "cron_created",
      summary: `Scheduled '${nameSlug.slug}' (${input.schedule_kind} ${scheduleValueTrimmed})`,
      payload: { cron_id: result.id, cron_name: result.name, brief: briefTrimmed },
    });
    revalidatePath("/", "layout");
    revalidatePath("/", "layout");
    return { ok: true, cron_id: result.id, cron_name: result.name };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function pauseCronAction(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await disableCron(id);
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function resumeCronAction(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await enableCron(id);
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function deleteCronAction(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await removeCron(id);
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function updateCronPromptAction(
  id: string,
  message: string,
): Promise<{ ok: boolean; error?: string }> {
  const trimmed = message.trim();
  if (!trimmed) return { ok: false, error: "Prompt cannot be empty." };
  try {
    getDb()
      .prepare("UPDATE scheduled_jobs SET message = ?, updated_at = ? WHERE id = ?")
      .run(trimmed, new Date().toISOString(), id);
    invalidateCronCache();
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
