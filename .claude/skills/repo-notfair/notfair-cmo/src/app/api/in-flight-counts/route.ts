import { NextResponse } from "next/server";

import { getActiveProject } from "@/server/active-project";
import { actionableApprovalCount } from "@/server/db/approvals";
import { inFlightCountsByAgent } from "@/server/db/tasks";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Lightweight liveness probe used by LiveCountsProvider to keep sidebar
 * badge counts fresh client-side. Replaces the previous router.refresh
 * approach — only the badge text nodes update, the server-rendered
 * sidebar tree never reconciles, so there's no visual flicker.
 */
export async function GET() {
  const project = await getActiveProject();
  if (!project) {
    return NextResponse.json({ project: null, agents: {}, approvals: 0 });
  }
  const countsMap = inFlightCountsByAgent(project.slug);
  const agents: Record<string, number> = {};
  for (const [agentId, count] of countsMap) agents[agentId] = count;
  const approvals = actionableApprovalCount(project.slug);
  return NextResponse.json({ project: project.slug, agents, approvals });
}
