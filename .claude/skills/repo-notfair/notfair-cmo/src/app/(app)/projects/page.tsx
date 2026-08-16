import Link from "next/link";
import { Archive } from "lucide-react";
import { listProjects } from "@/server/db/projects";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export default function ProjectsListPage() {
  const projects = listProjects({ includeArchived: true });

  return (
    <div className="ns-app-narrow">
      <header className="ns-page-head">
        <div className="ns-page-head-stack">
          <h1 className="ns-page-title">Workspaces</h1>
          <p className="ns-page-sub">
            <b>{projects.length}</b>{" "}
            {projects.length === 1 ? "workspace" : "workspaces"} on this
            machine.
          </p>
        </div>
        <div className="ns-page-actions">
          <Link href="/onboarding" className="ns-btn ns-btn-primary">
            New workspace
          </Link>
        </div>
      </header>

      {projects.length === 0 ? (
        <div className="ns-empty">
          <p className="ns-empty-title">No workspaces yet.</p>
          <p className="ns-empty-sub">
            Create your first workspace to get started.
          </p>
          <Link
            href="/onboarding"
            className="ns-btn ns-btn-primary ns-empty-action"
          >
            Create workspace
          </Link>
        </div>
      ) : (
        <ol className="ns-group">
          {projects.map((p) => (
            <li key={p.slug}>
              <Link href={`/${p.slug}`} className="ns-row-button">
                <span
                  aria-hidden
                  className="grid size-[38px] shrink-0 place-items-center rounded-[9px] bg-[hsl(var(--notfair-accent-soft))] text-[13px] font-semibold tracking-tight text-[hsl(var(--notfair-accent))]"
                >
                  {initials(p.display_name)}
                </span>
                <span className="ns-row-body">
                  <span className="ns-row-title-row">
                    <span className="ns-row-title">{p.display_name}</span>
                    {p.archived_at && (
                      <span className="ns-tag inline-flex items-center gap-1">
                        <Archive className="size-3" />
                        archived
                      </span>
                    )}
                  </span>
                  <span className="ns-row-desc block">
                    <span className="font-mono">{p.slug}</span>
                    {"  ·  Created "}
                    {new Date(p.created_at).toLocaleDateString()}
                  </span>
                </span>
                <span className="ns-row-meta">
                  <span className="chev" aria-hidden>
                    ›
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
