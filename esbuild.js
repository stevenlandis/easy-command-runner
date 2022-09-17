require("esbuild").build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  minify: true,
  outdir: "build",
  platform: "node",
  target: "es2015",
});
