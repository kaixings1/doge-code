import { homedir } from "node:os";
import { NextResponse } from "next/server";
import { pickFolder } from "@/server/fs/pick-folder";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Open the OS-native folder picker on the local machine and return the
 * chosen absolute path. The client calls this once when the user clicks
 * "Browse..." in the onboarding form — the dialog appears on the user's
 * own screen because this server runs locally (loopback-only).
 *
 * Method: POST (state-changing in the sense that it spawns a UI dialog).
 * No request body — the prompt/default location are baked in here so the
 * surface stays minimal. Future extension can accept a JSON body.
 */
export async function POST(_request: Request) {
  const result = await pickFolder({
    prompt: "Select your project's codebase folder",
    defaultLocation: homedir(),
  });
  if (result.ok) {
    return NextResponse.json({ ok: true, path: result.path });
  }
  if (result.kind === "cancelled") {
    return NextResponse.json({ ok: false, kind: "cancelled" });
  }
  if (result.kind === "unsupported") {
    return NextResponse.json(
      {
        ok: false,
        kind: "unsupported",
        message: `Native folder picker not implemented for ${result.platform}. Type the path manually for now.`,
      },
      { status: 501 },
    );
  }
  return NextResponse.json(
    { ok: false, kind: "error", message: result.message },
    { status: 500 },
  );
}
