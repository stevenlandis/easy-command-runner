require("esbuild").build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  minify: true,
  // format: "esm",
  // sourcemap: true,
  outfile: "build/out.js",
  // external: ['react', 'react-dom'],
});
