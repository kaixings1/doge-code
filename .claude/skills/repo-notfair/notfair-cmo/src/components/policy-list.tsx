"use client";

import { useState, useTransition } from "react";
import { Trash2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  createPolicyAction,
  deletePolicyAction,
} from "@/server/actions/approvals";
import type { ApprovalPolicy, ApprovalType } from "@/types";

const ACTION_TYPES: { key: ApprovalType; label: string }[] = [
  { key: "spend", label: "Spend" },
  { key: "content_publishing", label: "Content publishing" },
  { key: "new_channel", label: "New channel" },
  { key: "bid_change", label: "Bid change" },
  { key: "audience_change", label: "Audience change" },
  { key: "other", label: "Other" },
];

function formatUsd(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function PolicyList({
  projectSlug,
  policies,
}: {
  projectSlug: string;
  policies: ApprovalPolicy[];
}) {
  const [showForm, setShowForm] = useState(false);
  const [actionType, setActionType] = useState<ApprovalType>("spend");
  const [agentId, setAgentId] = useState("");
  const [maxCost, setMaxCost] = useState("");
  const [autoDecision, setAutoDecision] = useState<"approve" | "reject">("approve");
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();

  function submit() {
    start(async () => {
      const cap = maxCost.trim() ? Number(maxCost) : null;
      if (maxCost.trim() && (!Number.isFinite(cap) || cap! < 0)) {
        toast.error("Cost cap must be non-negative number");
        return;
      }
      const r = await createPolicyAction({
        project_slug: projectSlug,
        action_type: actionType,
        agent_id: agentId.trim() || null,
        max_cost_usd: cap,
        auto_decision: autoDecision,
        note: note.trim() || null,
      });
      if (!r.ok) toast.error(r.error ?? "Failed to create policy");
      else {
        toast.success("Policy saved");
        setShowForm(false);
        setAgentId("");
        setMaxCost("");
        setNote("");
      }
    });
  }
  function remove(id: string) {
    start(async () => {
      const r = await deletePolicyAction(id);
      if (!r.ok) toast.error(r.error ?? "Failed to delete policy");
      else toast.success("Policy removed");
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-sm font-medium">Auto-approve rules</p>
              <p className="text-xs text-muted-foreground">
                When an agent requests a matching action, it's auto-decided without
                surfacing in the inbox. Tighter rules win first (specific agent, lower
                cost cap).
              </p>
            </div>
            <Button size="sm" onClick={() => setShowForm((s) => !s)} disabled={pending}>
              {showForm ? "Cancel" : "New rule"}
            </Button>
          </div>

          {showForm && (
            <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-xs">
                  <span className="block font-medium">Action type</span>
                  <select
                    value={actionType}
                    onChange={(e) => setActionType(e.target.value as ApprovalType)}
                    className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    disabled={pending}
                  >
                    {ACTION_TYPES.map((t) => (
                      <option key={t.key} value={t.key}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 text-xs">
                  <span className="block font-medium">Decision</span>
                  <select
                    value={autoDecision}
                    onChange={(e) => setAutoDecision(e.target.value as "approve" | "reject")}
                    className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    disabled={pending}
                  >
                    <option value="approve">Auto-approve</option>
                    <option value="reject">Auto-reject</option>
                  </select>
                </label>
                <label className="space-y-1 text-xs">
                  <span className="block font-medium">
                    Agent ID <span className="text-muted-foreground">(optional)</span>
                  </span>
                  <Input
                    value={agentId}
                    onChange={(e) => setAgentId(e.target.value)}
                    placeholder="Any agent"
                    disabled={pending}
                  />
                </label>
                <label className="space-y-1 text-xs">
                  <span className="block font-medium">
                    Cost cap USD <span className="text-muted-foreground">(optional)</span>
                  </span>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={maxCost}
                    onChange={(e) => setMaxCost(e.target.value)}
                    placeholder="No cap"
                    disabled={pending}
                  />
                </label>
              </div>
              <label className="space-y-1 text-xs">
                <span className="block font-medium">Note (shown to the agent)</span>
                <Input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Why does this rule exist?"
                  disabled={pending}
                />
              </label>
              <div>
                <Button size="sm" onClick={submit} disabled={pending}>
                  Save rule
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {policies.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No rules yet. Without rules, every write surfaces in the inbox.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {policies.map((p) => (
            <Card key={p.id}>
              <CardContent className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline" className="text-[10px]">
                      {p.action_type}
                    </Badge>
                    <Badge
                      variant={p.auto_decision === "approve" ? "default" : "destructive"}
                      className="gap-1 text-[10px]"
                    >
                      <ShieldCheck className="size-3" />
                      Auto-{p.auto_decision}
                    </Badge>
                    {p.agent_id ? (
                      <Badge variant="secondary" className="text-[10px] font-mono">
                        {p.agent_id}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px]">
                        any agent
                      </Badge>
                    )}
                    {p.max_cost_usd != null && (
                      <Badge variant="outline" className="text-[10px]">
                        ≤ {formatUsd(p.max_cost_usd)}
                      </Badge>
                    )}
                  </div>
                  {p.note && (
                    <p className="text-sm leading-snug">{p.note}</p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => remove(p.id)}
                  disabled={pending}
                  aria-label="Delete policy"
                >
                  <Trash2 className="size-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
