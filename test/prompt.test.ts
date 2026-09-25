import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { loadEffectivePrompt, PROMPT_FILENAME } from "../src/prompt.ts";

async function createPaths(t: test.TestContext): Promise<{ global: string; project: string }> {
  const directory = await mkdtemp(join(tmpdir(), "slye-prompt-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return {
    global: join(directory, "agent", PROMPT_FILENAME),
    project: join(directory, "project", ".pi", PROMPT_FILENAME),
  };
}

async function writePrompt(path: string, text: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text, "utf8");
}

test("uses the built-in prompt when neither scoped prompt file exists", async (t) => {
  const paths = await createPaths(t);

  assert.deepEqual(await loadEffectivePrompt(paths.global, paths.project, true), { kind: "missing" });
});

test("uses a global prompt when the trusted project prompt is missing", async (t) => {
  const paths = await createPaths(t);
  await writePrompt(paths.global, "global prompt");

  assert.deepEqual(await loadEffectivePrompt(paths.global, paths.project, true), {
    kind: "valid",
    text: "global prompt",
  });
});

test("uses a trusted project prompt before the global prompt", async (t) => {
  const paths = await createPaths(t);
  await writePrompt(paths.global, "global prompt");
  await writePrompt(paths.project, "project prompt");

  assert.deepEqual(await loadEffectivePrompt(paths.global, paths.project, true), {
    kind: "valid",
    text: "project prompt",
  });
});

test("ignores an invalid project prompt when the project is untrusted", async (t) => {
  const paths = await createPaths(t);
  await writePrompt(paths.global, "global prompt");
  await writePrompt(paths.project, "\n \t");

  assert.deepEqual(await loadEffectivePrompt(paths.global, paths.project, false), {
    kind: "valid",
    text: "global prompt",
  });
});

test("blocks global fallback for a blank trusted project prompt", async (t) => {
  const paths = await createPaths(t);
  await writePrompt(paths.global, "global prompt");
  await writePrompt(paths.project, "\n \t");

  assert.deepEqual(await loadEffectivePrompt(paths.global, paths.project, true), {
    kind: "invalid",
    path: paths.project,
  });
});

test("treats a blank global prompt as invalid", async (t) => {
  const paths = await createPaths(t);
  await writePrompt(paths.global, "\n \t");

  assert.deepEqual(await loadEffectivePrompt(paths.global, paths.project, true), {
    kind: "invalid",
    path: paths.global,
  });
});

test("treats a directory at the selected prompt path as invalid", async (t) => {
  const paths = await createPaths(t);
  await mkdir(paths.global, { recursive: true });

  assert.deepEqual(await loadEffectivePrompt(paths.global, paths.project, false), {
    kind: "invalid",
    path: paths.global,
  });
});

test("returns nonblank prompt text verbatim", async (t) => {
  const paths = await createPaths(t);
  const prompt = "\n  Keep this leading whitespace.\nAnd this trailing whitespace.  \n";
  await writePrompt(paths.global, prompt);

  assert.deepEqual(await loadEffectivePrompt(paths.global, paths.project, false), {
    kind: "valid",
    text: prompt,
  });
});
