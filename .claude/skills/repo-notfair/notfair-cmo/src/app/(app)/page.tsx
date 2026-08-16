import { redirect } from "next/navigation";
import { getActiveProject } from "@/server/active-project";
import { projectHref } from "@/lib/project-href";

/**
 * Root entry. Project-scoped routes now live under `/<slug>/...`, so the
 * bare root just resolves the user's active (or first) project and bounces
 * them to that home. With no projects at all, kick into onboarding.
 */
export default async function RootRedirect() {
  const project = await getActiveProject();
  if (project) {
    redirect(projectHref(project.slug));
  }
  redirect("/onboarding");
}
