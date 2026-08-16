"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { projectHref } from "@/lib/project-href";

type Props = {
  projectSlug: string;
  agentSlug: string;
};

/**
 * Discoverable "new chat" affordance next to the thread dropdown.
 */
export function NewChatButton({ projectSlug, agentSlug }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function newThread() {
    const id = crypto.randomUUID();
    start(() =>
      router.push(projectHref(projectSlug, `/agents/${agentSlug}/chat/${id}`)),
    );
  }

  return (
    <button
      type="button"
      onClick={newThread}
      disabled={pending}
      aria-label="New chat"
      title="New chat"
      className="ns-btn ns-btn-outline ns-btn-sm"
    >
      <Plus className="size-3.5" />
      <span>New chat</span>
    </button>
  );
}
