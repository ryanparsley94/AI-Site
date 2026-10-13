import { build } from "esbuild";
import { createRequire } from "node:module";
await build({
  entryPoints: ["test/marketing-delivery.test.ts"],
  outfile: "test/.marketing-delivery.test.mjs",
  bundle: true, platform: "node", format: "esm",
  plugins: [{
    name: "bundle-workspace-only",
    setup(build) {
      build.onResolve({ filter: /^[^./]/ }, args => {
        if (!args.path.startsWith("@workspace/")) {
          return { path: createRequire(args.importer).resolve(args.path), external: true };
        }
      });
    },
  }],
});
