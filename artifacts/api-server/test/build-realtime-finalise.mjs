import { build } from "esbuild";
import { createRequire } from "node:module";
import path from "node:path";
await build({
  entryPoints: ["test/realtime-finalise.test.ts"],
  outfile: "test/.realtime-finalise.test.mjs",
  bundle: true, platform: "node", format: "esm",
  plugins: [{
    name: "isolate-call-providers",
    setup(builder) {
      builder.onResolve({ filter: /^@workspace\/db$/ }, () => ({ path: path.resolve("test/support/realtime-db.ts") }));
      builder.onResolve({ filter: /\/logger$/ }, () => ({ path: "logger", namespace: "test-logger" }));
      builder.onLoad({ filter: /.*/, namespace: "test-logger" }, () => ({
        contents: "export const logger = {warn(){},error(){}}", loader: "js",
      }));
      builder.onResolve({ filter: /^[^./]/ }, args => {
        if (args.path === "@workspace/db") return;
        return { path: createRequire(args.importer).resolve(args.path), external: true };
      });
    },
  }],
});
