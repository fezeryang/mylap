import { createHash } from "node:crypto"
import {
  existsSync,
  lstatSync,
  readFileSync,
  readlinkSync,
  readdirSync,
  statSync,
} from "node:fs"
import { basename, join, relative, sep } from "node:path"
import { compareUtf8 } from "./evidence-utils.mjs"

export const sha256 = (value) => createHash("sha256").update(value).digest("hex")

export const normalizedRelative = (root, path) => relative(root, path).split(sep).join("/")

export const walkRegularFiles = (root) => {
  if (!existsSync(root)) return []
  const files = []
  const visit = (path) => {
    const entry = lstatSync(path)
    if (entry.isSymbolicLink()) return
    if (entry.isFile()) {
      files.push(path)
      return
    }
    if (!entry.isDirectory()) return
    for (const name of readdirSync(path).sort(compareUtf8)) visit(join(path, name))
  }
  visit(root)
  return files
}

const excludedAuthoredPath = (path) => {
  const segments = path.split("/")
  return (
    segments.includes("node_modules") ||
    segments.includes("dist") ||
    segments.includes("evidence") ||
    segments.includes(".img2threejs") ||
    basename(path) === "parts.json" ||
    path.startsWith(".omo/") ||
    path.startsWith("archive-cyberdeck/") ||
    path.startsWith("desk/detail-evidence/") ||
    path.startsWith("desk/material-evidence/") ||
    path.startsWith("phone/src/model/generated/") ||
    path.startsWith("ratio/src/model/generated/") ||
    path === "desk/src/createObjectModel.generated.ts"
  )
}

const rootAuthoredName = (name) =>
  [
    "AGENTS.md",
    "DESIGN.md",
    "README.md",
    "index.html",
    "package.json",
    "pnpm-lock.yaml",
    "bun.lock",
  ].includes(name) ||
  /^tsconfig.*\.json$/.test(name) ||
  /^vite\.config\..+$/.test(name) ||
  /^biome\.json.*$/.test(name)

export const authoredFiles = (root) => {
  const directoryRoots = ["src", "scripts", "public", "docs", "phone", "desk", "ratio"]
  const candidates = [
    ...readdirSync(root)
      .filter(rootAuthoredName)
      .map((name) => join(root, name)),
    ...directoryRoots.flatMap((name) => walkRegularFiles(join(root, name))),
  ]
  return candidates
    .filter((path) => lstatSync(path).isFile())
    .filter((path) => !excludedAuthoredPath(normalizedRelative(root, path)))
    .sort((left, right) =>
      compareUtf8(normalizedRelative(root, left), normalizedRelative(root, right)),
    )
}

export const generatedFiles = (root) =>
  [
    ...walkRegularFiles(join(root, "phone/src/model/generated")),
    ...walkRegularFiles(join(root, "ratio/src/model/generated")),
    join(root, "desk/src/createObjectModel.generated.ts"),
  ]
    .filter((path) => existsSync(path) && lstatSync(path).isFile())
    .sort((left, right) =>
      compareUtf8(normalizedRelative(root, left), normalizedRelative(root, right)),
    )

export const fingerprint = (paths, root) => {
  const tuples = paths.map(
    (path) => `${normalizedRelative(root, path)}\0${sha256(readFileSync(path))}\n`,
  )
  return sha256(tuples.join(""))
}

export const protectedProblems = (baseline, workspace) => {
  const problems = []
  for (const expected of [...baseline.dirtyEntries, ...baseline.immutableEntries]) {
    const path = join(workspace, expected.path)
    if (!existsSync(path)) {
      problems.push(`${expected.path}:missing`)
      continue
    }
    const entry = lstatSync(path)
    const type = entry.isSymbolicLink() ? "symlink" : entry.isFile() ? "file" : "other"
    const hash = type === "file" ? sha256(readFileSync(path)) : null
    const linkTarget = type === "symlink" ? readlinkSync(path) : null
    if (
      type !== expected.type ||
      entry.mode !== expected.mode ||
      hash !== expected.sha256 ||
      linkTarget !== expected.linkTarget
    ) {
      problems.push(`${expected.path}:changed`)
    }
  }
  return problems
}

export const workspaceSnapshot = (workspace, excludedEvidenceDir) => {
  const excluded = normalizedRelative(workspace, excludedEvidenceDir)
  const tuples = []
  const visit = (path) => {
    const pathRelative = normalizedRelative(workspace, path)
    if (
      pathRelative === ".git" ||
      pathRelative.startsWith(".git/") ||
      pathRelative === "node_modules" ||
      pathRelative.includes("/node_modules/") ||
      pathRelative === excluded ||
      pathRelative.startsWith(`${excluded}/`)
    ) {
      return
    }
    const entry = lstatSync(path)
    if (entry.isSymbolicLink()) {
      tuples.push(`${pathRelative}\0symlink\0${entry.mode}\0${readlinkSync(path)}\0\n`)
      return
    }
    if (entry.isFile()) {
      tuples.push(`${pathRelative}\0file\0${entry.mode}\0\0${sha256(readFileSync(path))}\n`)
      return
    }
    if (!entry.isDirectory()) return
    for (const name of readdirSync(path).sort(compareUtf8)) visit(join(path, name))
  }
  for (const name of readdirSync(workspace).sort(compareUtf8)) visit(join(workspace, name))
  return sha256(tuples.join(""))
}

export const artifactRecords = (root, manifestPath) =>
  walkRegularFiles(root)
    .filter((path) => path !== manifestPath)
    .map((path) => ({
      path: normalizedRelative(root, path),
      sha256: sha256(readFileSync(path)),
      size: statSync(path).size,
    }))
