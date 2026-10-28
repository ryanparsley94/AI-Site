import { build } from "esbuild";
import { createRequire } from "node:module";

await build({
  entryPoints: ["test/admin-access.test.ts"],
  outfile: "test/.admin-access.test.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  plugins: [{
    name: "bundle-workspace-only",
    setup(build) {
      build.onResolve({ filter: /^ws$/ }, () => ({
        path: "ws-stub",
        namespace: "admin-access-test",
      }));
      build.onLoad({ filter: /.*/, namespace: "admin-access-test" }, () => ({
        contents: `
          export class WebSocketServer {
            on() {}
            handleUpgrade() {}
            emit() {}
          }
          export class WebSocket {}
        `,
        loader: "ts",
      }));
      build.onResolve({ filter: /^[^./]/ }, args => {
        if (!args.path.startsWith("@workspace/")) {
          return { path: createRequire(args.importer).resolve(args.path), external: true };
        }
      });
    },
  }],
});
