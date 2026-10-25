import { readFile, writeFile, mkdir } from "node:fs/promises";
import { extname } from "node:path";
import { createHash } from "node:crypto";
import { rollup } from "rollup";
import esbuild from "rollup-plugin-esbuild";
import commonjs from "@rollup/plugin-commonjs";
import nodeResolve from "@rollup/plugin-node-resolve";
import swc from "@swc/core";

const sourceDir = "./legacy/Multi Emoji";
const outputDir = "./dist/Multi-Emoji";
const manifest = JSON.parse(await readFile(`${sourceDir}/manifest.json`, "utf8"));
const extensions = [".js", ".jsx", ".mjs", ".ts", ".tsx", ".cts", ".mts"];

const plugins = [
  nodeResolve(),
  commonjs(),
  {
    name: "swc",
    async transform(code, id) {
      const ext = extname(id);
      if (!extensions.includes(ext)) return null;
      const ts = ext.includes("ts");
      const tsx = ts ? ext.endsWith("x") : undefined;
      const jsx = !ts ? ext.endsWith("x") : undefined;
      const result = await swc.transform(code, {
        filename: id,
        jsc: { externalHelpers: true, parser: { syntax: ts ? "typescript" : "ecmascript", tsx, jsx } },
        env: { targets: "defaults", include: ["transform-classes", "transform-arrow-functions"] },
      });
      return result.code;
    },
  },
  esbuild({ minify: true }),
];

await mkdir(outputDir, { recursive: true });
const bundle = await rollup({
  input: `${sourceDir}/${manifest.main}`,
  onwarn(warning, warn) {
    if (warning.code === "UNRESOLVED_IMPORT") return;
    warn(warning);
  },
  plugins,
});
await bundle.write({
  file: `${outputDir}/index.js`,
  format: "iife",
  compact: true,
  exports: "named",
  globals(id) {
    if (id.startsWith("@vendetta")) return id.substring(1).replace(/\//g, ".");
    if (id === "react") return "window.React";
    return null;
  },
});
await bundle.close();

const output = await readFile(`${outputDir}/index.js`);
manifest.hash = createHash("sha256").update(output).digest("hex");
manifest.main = "index.js";
await writeFile(`${outputDir}/manifest.json`, JSON.stringify(manifest, null, 2) + "\n");
console.log(`Built ${manifest.name} to ${outputDir}`);
