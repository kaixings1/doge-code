"use client";

import { useTransition } from "react";
import { RotateCw } from "lucide-react";
import { toast } from "sonner";

type ReprovisionResult =
  | { ok: true; created: string[]; existed: string[] }
  | { ok: false; error: string };

type Props = {
  action: () => Promise<ReprovisionResult>;
};

export function ReprovisionButton({ action }: Props) {
  const [pending, start] = useTransition();

  function go() {
    start(async () => {
      const r = await action();
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      const created = r.created.length;
      const existed = r.existed.length;
      toast.success(
        created > 0
          ? `Provisioned ${created} new agent${created === 1 ? "" : "s"}.`
          : `All ${existed} agents already exist.`,
      );
    });
  }

  return (
    <button
      type="button"
      onClick={go}
      disabled={pending}
      className="ns-btn ns-btn-outline ns-btn-sm"
    >
      <RotateCw className={`size-3.5 ${pending ? "animate-spin" : ""}`} />
      {pending ? "Provisioning…" : "Reprovision agents"}
    </button>
  );
}
