import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { defineConfig } from "vite"

const harnessRoot = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  root: harnessRoot,
  publicDir: resolve(harnessRoot, "../../public"),
  build: {
    outDir: process.env.QA_BUILD_DIR ?? resolve(harnessRoot, "../../dist-qa-forbidden"),
    emptyOutDir: true,
  },
})
