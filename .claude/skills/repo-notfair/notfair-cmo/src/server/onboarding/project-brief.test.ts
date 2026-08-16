import { mkdtempSync } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const tmpRoot = mkdtempSync(join(tmpdir(), "notfair-cmo-pb-"));
process.env.NOTFAIR_CMO_DATA_DIR = tmpRoot;

import {
  deleteProjectBriefDir,
  projectBriefDir,
  projectBriefPath,
  readProjectBrief,
  renameProjectBriefDir,
  writeProjectBrief,
} from "./project-brief";

describe("project-brief paths + writeProjectBrief + readProjectBrief", () => {
  it("writes + reads back at the canonical path", async () => {
    await writeProjectBrief("alpha", "# Alpha\n\nbody");
    const got = await readProjectBrief("alpha");
    expect(got).toBe("# Alpha\n\nbody");
    const on_disk = await readFile(projectBriefPath("alpha"), "utf8");
    expect(on_disk).toBe("# Alpha\n\nbody");
  });

  it("readProjectBrief returns null when missing", async () => {
    expect(await readProjectBrief("never-written")).toBeNull();
  });
});

describe("deleteProjectBriefDir", () => {
  it("removes the canonical dir + its file", async () => {
    await writeProjectBrief("doomed", "to be deleted");
    await deleteProjectBriefDir("doomed");
    expect(await readProjectBrief("doomed")).toBeNull();
    await expect(stat(projectBriefDir("doomed"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("is a no-op when the dir doesn't exist", async () => {
    await expect(
      deleteProjectBriefDir("nothing-here-either"),
    ).resolves.toBeUndefined();
  });
});

describe("renameProjectBriefDir", () => {
  it("moves the dir to the new slug", async () => {
    await writeProjectBrief("from-slug", "original body");
    await renameProjectBriefDir("from-slug", "to-slug");
    expect(await readProjectBrief("from-slug")).toBeNull();
    expect(await readProjectBrief("to-slug")).toBe("original body");
  });

  it("is a no-op when old == new", async () => {
    await writeProjectBrief("same-same", "body");
    await renameProjectBriefDir("same-same", "same-same");
    expect(await readProjectBrief("same-same")).toBe("body");
  });

  it("is a no-op when the source dir doesn't exist", async () => {
    await expect(
      renameProjectBriefDir("nonexistent-source", "any-dest"),
    ).resolves.toBeUndefined();
    expect(await readProjectBrief("any-dest")).toBeNull();
  });

  it("rejects when the destination already exists (slug collision)", async () => {
    // Both dirs exist — rename would clobber the destination silently
    // on POSIX, which is the kind of bug we want to surface upstream.
    await mkdir(projectBriefDir("clobber-src"), { recursive: true });
    await writeFile(
      projectBriefPath("clobber-src"),
      "from",
      "utf8",
    );
    await mkdir(projectBriefDir("clobber-dst"), { recursive: true });
    await writeFile(
      projectBriefPath("clobber-dst"),
      "to",
      "utf8",
    );
    // Node's rename() on POSIX *does* overwrite an empty dir, so this
    // catches the more dangerous "dest has content" case where rename
    // would fail with ENOTEMPTY. The point is the caller learns about
    // it instead of silently losing data.
    await expect(
      renameProjectBriefDir("clobber-src", "clobber-dst"),
    ).rejects.toMatchObject({ code: expect.stringMatching(/ENOTEMPTY|EEXIST/) });
  });
});

afterAll(async () => {
  void tmpRoot; // keep tmpdir alive across tests; vitest will tear down the process
});
beforeAll(() => {
  // no-op; the env was set at import time so the module captured the dir
});
