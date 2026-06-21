#!/usr/bin/env -S node --experimental-strip-types

import fs from "node:fs";
import type { BuildOptions } from "esbuild";
import esbuild from "esbuild";

const watch = process.argv.includes("--watch");
const minify = process.argv.includes("--minify");

const opts: BuildOptions = {
  bundle: true,
  logLevel: "info",
  metafile: true,
  minify,
  sourcemap: "linked",
  target: "es2023",
};

const clientOpts: BuildOptions = {
  ...opts,
  entryPoints: ["src/client/verify.ts"],
  format: "esm",
  outdir: "public",
  platform: "browser",
};

const serverOpts: BuildOptions = {
  ...opts,
  entryPoints: ["src/server/index.ts"],
  format: "cjs",
  outdir: "dist/server",
  platform: "node",
};

if (watch) {
  const clientCtx = await esbuild.context(clientOpts);
  const serverCtx = await esbuild.context(serverOpts);
  await Promise.all([clientCtx.watch(), serverCtx.watch()]);
} else {
  fs.mkdirSync("dist", { recursive: true });
  const [client, server] = await Promise.all([
    esbuild.build(clientOpts),
    esbuild.build(serverOpts),
  ]);
  if (client.metafile) {
    fs.writeFileSync("dist/client.meta.json", JSON.stringify(client.metafile));
  }
  if (server.metafile) {
    fs.writeFileSync("dist/server.meta.json", JSON.stringify(server.metafile));
  }
}
