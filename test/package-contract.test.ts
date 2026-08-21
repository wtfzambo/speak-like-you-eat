import assert from "node:assert/strict";
import { exec } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import { promisify } from "node:util";

const README_LINKED_DOCUMENTS = [
  "backlog/docs/specs/doc-1 - SLYE-MVP-specification.md",
  "backlog/docs/specs/doc-4 - SLYE-benchmark-results.md",
];

const PACKAGE_FILES = [
  "src",
  "imgs/front.png",
  "README.md",
  "backlog/docs/specs/doc-1 - SLYE-MVP-specification.md",
  "backlog/docs/specs/doc-4 - SLYE-benchmark-results.md",
];

const PACKED_FILES = [
  "LICENSE",
  "README.md",
  "backlog/docs/specs/doc-1 - SLYE-MVP-specification.md",
  "backlog/docs/specs/doc-4 - SLYE-benchmark-results.md",
  "imgs/front.png",
  "package.json",
  "src/config.ts",
  "src/index.ts",
  "src/model-completion.ts",
  "src/model-picker.ts",
  "src/model-rewrite.ts",
  "src/omp.ts",
  "src/rewrite.ts",
];

const STABLE_SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

type PackageManifest = {
  name: string;
  version: string;
  author: string;
  license: string;
  repository: { url: string };
  homepage: string;
  bugs: string;
  publishConfig: { access: string };
  files: string[];
  pi: { extensions: string[]; image: string };
  omp: { extensions: string[]; image: string };
};

type PackageLock = {
  version: string;
  packages: { "": { version: string } };
};

const runCommand = promisify(exec);

test("the package manifest declares public release metadata, its host extensions, README-linked governed documents, and the 13-file public allowlist", async () => {
  const packageUrl = new URL("../package.json", import.meta.url);
  const packageJson = JSON.parse(await readFile(packageUrl, "utf8")) as PackageManifest;
  const packageLockUrl = new URL("../package-lock.json", import.meta.url);
  const packageLock = JSON.parse(await readFile(packageLockUrl, "utf8")) as PackageLock;
  const piExtensionPath = "./src/index.ts";
  const ompExtensionPath = "./src/omp.ts";
  const packageImage = "https://raw.githubusercontent.com/wtfzambo/speak-like-you-eat/refs/heads/main/imgs/front.png";

  assert.match(packageJson.version, STABLE_SEMVER);
  assert.equal(packageLock.version, packageJson.version);
  assert.equal(packageLock.packages[""].version, packageJson.version);

  assert.deepEqual(
    {
      name: packageJson.name,
      author: packageJson.author,
      license: packageJson.license,
      repository: packageJson.repository.url,
      homepage: packageJson.homepage,
      bugs: packageJson.bugs,
      publishConfig: packageJson.publishConfig,
    },
    {
      name: "speak-like-you-eat",
      author: "wtfzambo",
      license: "MIT",
      repository: "git+https://github.com/wtfzambo/speak-like-you-eat.git",
      homepage: "https://github.com/wtfzambo/speak-like-you-eat#readme",
      bugs: "https://github.com/wtfzambo/speak-like-you-eat/issues",
      publishConfig: { access: "public" },
    },
  );
  assert.deepEqual(packageJson.files, PACKAGE_FILES);
  assert.deepEqual(packageJson.pi, {
    extensions: [piExtensionPath],
    image: packageImage,
  });
  assert.deepEqual(packageJson.omp, {
    extensions: [ompExtensionPath],
    image: packageImage,
  });

  await access(new URL(piExtensionPath, packageUrl));
  await access(new URL(ompExtensionPath, packageUrl));
  await access(new URL("../README.md", import.meta.url));
  for (const documentPath of README_LINKED_DOCUMENTS) {
    await access(new URL(`../${documentPath}`, import.meta.url));
  }

  const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");
  assert.ok(readme.includes("backlog/docs/specs/doc-1%20-%20SLYE-MVP-specification.md"));
  assert.ok(readme.includes("backlog/docs/specs/doc-4%20-%20SLYE-benchmark-results.md"));
  assert.ok(!readme.includes("backlog/docs/runbooks/doc-2%20-%20SLYE-sandbox-manual-checks.md"));

  const packed = JSON.parse(
    (await runCommand("npm pack --dry-run --json", { cwd: new URL("../", import.meta.url) })).stdout,
  ) as Array<{ files: Array<{ path: string }> }>;
  const packedArchive = packed[0];
  if (!packedArchive) {
    throw new Error("npm pack did not return an archive");
  }
  assert.deepEqual(packedArchive.files.map((file) => file.path).sort(), PACKED_FILES);

  const piExtension = await import(new URL(piExtensionPath, packageUrl).href);
  const ompExtension = await import(new URL(ompExtensionPath, packageUrl).href);
  assert.equal(typeof piExtension.default, "function");
  assert.equal(typeof ompExtension.default, "function");
});
