"use client";

import { useState, useTransition } from "react";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  approveAction,
  createPolicyAction,
  rejectAction,
} from "@/server/actions/approvals";
import type { Approval } from "@/types";

const ACTION_TYPE_LABEL: Record<Approval["action_type"], string> = {
  spend: "Spend",
  content_publishing: "Content",
  new_channel: "New channel",
  bid_change: "Bid change",
  audience_change: "Audience",
  other: "Other",
};

const STATUS_TAG: Record<Approval["status"], { label: string; cls: string }> = {
  pending: { label: "Pending", cls: "ns-tag-accent" },
  revision_requested: { label: "Revision requested", cls: "ns-tag-amber" },
  approved: { label: "Approved", cls: "ns-tag-accent" },
  rejected: { label: "Rejected", cls: "ns-tag-red" },
  expired: { label: "Expired", cls: "ns-tag" },
};

function formatUsd(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function timeAgo(iso: string) {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return `${Math.floor(seconds)}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export type ApprovalCardProps = {
  approval: Approval;
};

export function ApprovalCard({ approval }: ApprovalCardProps) {
  const [denyOpen, setDenyOpen] = useState(false);
  const [denyNote, setDenyNote] = useState("");
  const [showPolicyForm, setShowPolicyForm] = useState(false);
  const [policyCostCap, setPolicyCostCap] = useState("");
  const [policyScope, setPolicyScope] = useState<"agent" | "any">("agent");
  const [pending, start] = useTransition();

  const actionable =
    approval.status === "pending" || approval.status === "revision_requested";
  const statusTag = STATUS_TAG[approval.status];

  function approve() {
    start(async () => {
      const r = await approveAction(approval.id);
      if (!r.ok) toast.error(r.error ?? "Failed to approve");
      else toast.success("Approved — agent is being notified");
    });
  }
  function rejectWith(note: string | undefined) {
    start(async () => {
      const r = await rejectAction(approval.id, note);
      if (!r.ok) toast.error(r.error ?? "Failed to reject");
      else {
        toast.success(note ? "Rejected with feedback" : "Rejected");
        setDenyOpen(false);
        setDenyNote("");
      }
    });
  }
  function alwaysApprove() {
    start(async () => {
      const cap = policyCostCap.trim();
      const max = cap ? Number(cap) : null;
      if (cap && (!Number.isFinite(max) || max! < 0)) {
        toast.error("Cost cap must be a non-negative number.");
        return;
      }
      const r = await createPolicyAction({
        project_slug: approval.project_slug,
        action_type: approval.action_type,
        agent_id: policyScope === "agent" ? approval.agent_id : null,
        max_cost_usd: max,
        auto_decision: "approve",
        note: `Always approve ${ACTION_TYPE_LABEL[approval.action_type]} requests${
          policyScope === "agent" ? ` from ${approval.agent_id}` : ""
        }${max != null ? ` ≤ ${formatUsd(max)}` : ""}.`,
      });
      if (!r.ok) toast.error(r.error ?? "Failed to save policy");
      else {
        toast.success("Saved. Future matching requests are auto-approved.");
        setShowPolicyForm(false);
        setPolicyCostCap("");
      }
    });
  }

  return (
    <>
      <article
        className="ns-card"
        role="region"
        aria-label={approval.action_summary}
        data-status={approval.status}
      >
        <div className="space-y-3 p-[18px]">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="ns-tag">{ACTION_TYPE_LABEL[approval.action_type]}</span>
            <span className={statusTag.cls}>{statusTag.label}</span>
            {approval.decided_by_kind === "policy" && (
              <span className="ns-tag inline-flex items-center gap-1">
                <ShieldCheck className="size-3" />
                Auto by policy
              </span>
            )}
          </div>
          <p className="m-0 text-[14.5px] font-medium leading-snug text-[hsl(var(--notfair-ink))]">
            {approval.action_summary}
          </p>
          <p className="m-0 text-[12px] text-[hsl(var(--notfair-ink-4))]">
            {approval.cost_estimate_usd > 0 && (
              <>
                Cost:{" "}
                <span className="font-medium text-[hsl(var(--notfair-ink-2))]">
                  {formatUsd(approval.cost_estimate_usd)}
                </span>{" "}
                ·{" "}
              </>
            )}
            Agent <span className="font-mono">{approval.agent_id}</span> ·{" "}
            {timeAgo(approval.created_at)}
          </p>

          {approval.reasoning && (
            <p className="m-0 whitespace-pre-wrap rounded-lg bg-[hsl(var(--notfair-surface-2))] p-3 text-[12.5px] leading-relaxed text-[hsl(var(--notfair-ink-3))]">
              {approval.reasoning}
            </p>
          )}

          {approval.decision_note && !actionable && (
            <div className="rounded-lg border border-dashed border-border bg-[hsl(var(--notfair-surface-2))]/60 p-3 text-[12px]">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-[hsl(var(--notfair-ink-4))]">
                Decision note
              </div>
              <p className="mt-1 whitespace-pre-wrap leading-relaxed text-[hsl(var(--notfair-ink-2))]">
                {approval.decision_note}
              </p>
            </div>
          )}

          {actionable && (
            <div className="space-y-3 pt-1">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={approve}
                  disabled={pending}
                  className="ns-btn ns-btn-primary ns-btn-sm"
                >
                  Approve
                </button>
                <button
                  type="button"
                  onClick={() => setDenyOpen(true)}
                  disabled={pending}
                  className="ns-btn ns-btn-outline ns-btn-sm"
                >
                  Deny
                </button>
                <button
                  type="button"
                  onClick={() => setShowPolicyForm((s) => !s)}
                  disabled={pending}
                  className="ns-btn ns-btn-ghost ns-btn-sm"
                >
                  <ShieldCheck className="size-3.5" />
                  Always approve
                </button>
              </div>

              {showPolicyForm && (
                <div className="space-y-2 rounded-lg border border-border bg-[hsl(var(--notfair-surface-2))]/60 p-3 text-[12px]">
                  <p className="m-0 font-semibold text-[hsl(var(--notfair-ink))]">
                    Create auto-approval policy
                  </p>
                  <p className="m-0 text-[hsl(var(--notfair-ink-4))]">
                    Future{" "}
                    <span className="font-mono">
                      {ACTION_TYPE_LABEL[approval.action_type]}
                    </span>{" "}
                    requests that match will be approved without asking.
                  </p>
                  <fieldset className="flex flex-wrap items-center gap-3 pt-1">
                    <label className="flex items-center gap-1.5">
                      <input
                        type="radio"
                        name={`scope-${approval.id}`}
                        checked={policyScope === "agent"}
                        onChange={() => setPolicyScope("agent")}
                      />
                      Only from{" "}
                      <span className="font-mono">{approval.agent_id}</span>
                    </label>
                    <label className="flex items-center gap-1.5">
                      <input
                        type="radio"
                        name={`scope-${approval.id}`}
                        checked={policyScope === "any"}
                        onChange={() => setPolicyScope("any")}
                      />
                      From any agent
                    </label>
                  </fieldset>
                  <label className="flex items-center gap-2">
                    Cost cap (USD, optional):
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={policyCostCap}
                      onChange={(e) => setPolicyCostCap(e.target.value)}
                      placeholder="∞"
                      className="h-7 w-28 text-xs"
                    />
                  </label>
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={alwaysApprove}
                      disabled={pending}
                      className="ns-btn ns-btn-primary ns-btn-sm"
                    >
                      Save policy
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowPolicyForm(false)}
                      disabled={pending}
                      className="ns-btn ns-btn-ghost ns-btn-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </article>

      <Dialog open={denyOpen} onOpenChange={(open) => !pending && setDenyOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>What do you want to change?</DialogTitle>
            <DialogDescription>
              Optional. Anything you type here is sent back to the agent so it
              can adjust its next attempt.
            </DialogDescription>
          </DialogHeader>
          <textarea
            value={denyNote}
            onChange={(e) => setDenyNote(e.target.value)}
            placeholder="e.g. Wait until next week so we can review the landing page first."
            rows={4}
            className="w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            disabled={pending}
            autoFocus
          />
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => rejectWith(undefined)}
              disabled={pending}
            >
              Reject without comments
            </Button>
            <Button
              onClick={() => rejectWith(denyNote.trim() || undefined)}
              disabled={pending || !denyNote.trim()}
            >
              Reject with comment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
