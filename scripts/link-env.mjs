#!/usr/bin/env node
// Runs on `pnpm install` (see the root "postinstall" script). Next.js only ever
// reads .env* files from the directory it runs in (apps/web), never from a
// monorepo root, and that lookup is hardcoded into next dev/build/start with
// no config option to redirect it. The whole repo keeps one .env.local at the
// root instead (see docs/development.md), so this symlinks it into apps/web
// on every install, keeping both locations always in sync automatically.
import { existsSync, lstatSync, readlinkSync, symlinkSync, unlinkSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rootEnvLocal = resolve(repoRoot, ".env.local");
const target = resolve(repoRoot, "apps/web/.env.local");
const relativeTarget = relative(dirname(target), rootEnvLocal);

if (!existsSync(rootEnvLocal)) {
  // Nothing to link yet, e.g. a fresh clone before `cp .env.example .env.local`.
  process.exit(0);
}

const existingStat = lstatSync(target, { throwIfNoEntry: false });
if (existingStat) {
  if (existingStat.isSymbolicLink() && readlinkSync(target) === relativeTarget) {
    process.exit(0); // Already linked correctly.
  }
  if (!existingStat.isSymbolicLink()) {
    console.warn(
      `[link-env] apps/web/.env.local already exists and is not a symlink; leaving it as is. ` +
        `Remove it and re-run "pnpm install" to link it to the root .env.local instead.`,
    );
    process.exit(0);
  }
  unlinkSync(target); // Stale symlink pointing elsewhere; relink below.
}

try {
  symlinkSync(relativeTarget, target);
} catch (error) {
  console.warn(
    `[link-env] Could not symlink apps/web/.env.local -> ${relativeTarget} (${error.code ?? error.message}). ` +
      `On Windows this needs Developer Mode or an elevated shell. Create it manually:\n` +
      `  ln -s ../../.env.local apps/web/.env.local`,
  );
}
