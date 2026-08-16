import { Sparkles } from "lucide-react";
import type { SkillEntry } from "@/server/agents/skills";

type Props = {
  skills: SkillEntry[];
};

export function SkillsList({ skills }: Props) {
  if (skills.length === 0) {
    return (
      <div className="ns-empty">
        <p className="ns-empty-title">No skills installed.</p>
        <p className="ns-empty-sub">
          Skills are reusable capabilities the agent picks up from this
          workspace. Install one to extend what this agent can do.
        </p>
      </div>
    );
  }
  return (
    <ol className="ns-group">
      {skills.map((s) => (
        <li key={s.key} className="ns-row">
          <span className="ns-glyph ns-glyph-sm" aria-hidden>
            <Sparkles className="size-[14px] text-[hsl(var(--notfair-ink-2))]" />
          </span>
          <div className="ns-row-body">
            <div className="ns-row-title-row">
              <span className="ns-row-title font-mono">{s.name}</span>
              <span className="ns-tag">{s.scope}</span>
            </div>
            {s.description && (
              <p className="ns-row-desc">{s.description}</p>
            )}
            {s.source && (
              <p className="mt-1 truncate font-mono text-[10.5px] text-[hsl(var(--notfair-ink-4))]">
                {s.source}
              </p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
