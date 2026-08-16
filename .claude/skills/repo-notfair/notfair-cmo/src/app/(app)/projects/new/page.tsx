import { redirect } from "next/navigation";

/**
 * Per D3 of the onboarding rework: /projects/new is replaced by the unified
 * /onboarding flow. This redirect keeps existing bookmarks + any in-flight
 * call sites that still link here working until they're updated.
 */
export default function NewProjectPage(): never {
  redirect("/onboarding");
}
