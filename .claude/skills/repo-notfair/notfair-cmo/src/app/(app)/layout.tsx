import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ClientMountGate } from "@/components/client-mount-gate";
import { LiveCountsProvider } from "@/components/live-counts-context";
import { getActiveProject } from "@/server/active-project";
import { actionableApprovalCount } from "@/server/db/approvals";
import { inFlightCountsByAgent } from "@/server/db/tasks";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Server-side initial values for the live-counts context. After the
  // client mounts, the context polls /api/in-flight-counts and updates
  // badges in place — no router.refresh, no sidebar reconciliation.
  const active = await getActiveProject();
  const initialAgents: Record<string, number> = {};
  if (active) {
    for (const [agentId, count] of inFlightCountsByAgent(active.slug)) {
      initialAgents[agentId] = count;
    }
  }
  const initialApprovals = active ? actionableApprovalCount(active.slug) : 0;

  return (
    <ClientMountGate
      fallback={
        <div className="min-h-screen bg-background" suppressHydrationWarning>
          {/* Empty shell during hydration — children mount client-side */}
        </div>
      }
    >
      <LiveCountsProvider
        initial={{
          project: active?.slug ?? null,
          agents: initialAgents,
          approvals: initialApprovals,
        }}
      >
        <SidebarProvider>
          <AppSidebar />
          <SidebarInset>
            <a href="#main-content" className="sr-only focus:not-sr-only">
              Skip to content
            </a>
            <main id="main-content" className="relative flex-1">
              {children}
            </main>
          </SidebarInset>
        </SidebarProvider>
      </LiveCountsProvider>
    </ClientMountGate>
  );
}
