require("esbuild").build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  minify: false,
  outdir: "build",
  platform: "node",
  target: "es2015",
});
