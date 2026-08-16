import Link from "next/link";
import { Plug } from "lucide-react";
import { projectHref } from "@/lib/project-href";
import type { AgentMcpBlocker } from "@/server/onboarding/agent-mcp-blocker";

/**
 * Rendered when an agent's required MCP isn't connected for this project.
 * Server-rendered — no client state. The "Connect" button is just a link
 * into the Connections page where the OAuth flow takes over.
 */
export function AgentMcpBlockerCard({
  projectSlug,
  blocker,
}: {
  projectSlug: string;
  blocker: AgentMcpBlocker;
}) {
  return (
    <div className="mx-auto flex h-full max-w-[440px] flex-col items-center justify-center px-6 py-12 text-center">
      <div
        aria-hidden
        className="grid size-14 place-items-center rounded-[14px] bg-[hsl(var(--notfair-accent-soft))] text-[hsl(var(--notfair-accent))]"
      >
        <Plug className="size-6" />
      </div>
      <h1 className="mt-5 text-[22px] font-semibold tracking-tight text-[hsl(var(--notfair-ink))]">
        Connect {blocker.mcp_display_name}
      </h1>
      <p className="mt-2 text-[14px] leading-relaxed text-[hsl(var(--notfair-ink-3))]">
        The <b className="font-semibold text-[hsl(var(--notfair-ink-2))]">
          {blocker.agent_display_name}
        </b>{" "}
        agent needs the {blocker.mcp_display_name} MCP before it can run.
        Connecting takes a single OAuth round-trip; we&rsquo;ll bring you back
        here when it&rsquo;s done.
      </p>
      <Link
        href={projectHref(projectSlug, "/connections")}
        className="ns-btn ns-btn-primary mt-6"
      >
        Connect {blocker.mcp_display_name}
      </Link>
    </div>
  );
}
