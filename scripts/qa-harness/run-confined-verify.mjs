import { spawnSync } from "node:child_process"
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import { dirname, join } from "node:path"
import { resolveFreshEvidenceDir } from "./evidence-utils.mjs"
import { fingerprintsRetained } from "./evidence-utils.mjs"
import { parseVerifyPackage } from "./qa-input.mjs"
import {
  artifactRecords,
  authoredFiles,
  fingerprint,
  generatedFiles,
  normalizedRelative,
  protectedProblems,
  workspaceSnapshot,
} from "./workspace-evidence.mjs"

const packageConfig = parseVerifyPackage(process.argv[2])
const packageName = packageConfig.name
const requestedEvidenceDir = process.env.EVIDENCE_DIR
if (requestedEvidenceDir === undefined) throw new Error("EVIDENCE_DIR is required")

const primary = realpathSync(process.cwd())
const evidenceDir = resolveFreshEvidenceDir(primary, requestedEvidenceDir)
const copyRoot = join(evidenceDir, "workspace")
const manifestPath = join(evidenceDir, "run-manifest.json")
const baselinePath = join(primary, ".omo/evidence/personal-3d-device-desktop-20260827-a1/protected/protected-worktree-baseline.json")
const baseline = JSON.parse(readFileSync(baselinePath, "utf8"))
const startedAt = new Date().toISOString()
const PAstart = fingerprint(authoredFiles(primary), primary)
const PGstart = fingerprint(generatedFiles(primary), primary)
const workspaceStart = workspaceSnapshot(primary, evidenceDir)
const protectedStartProblems = protectedProblems(baseline, primary)
mkdirSync(join(evidenceDir, "logs"), { recursive: true })

const copyFiles = (paths) => {
  for (const source of paths) {
    const destination = join(copyRoot, normalizedRelative(primary, source))
    mkdirSync(dirname(destination), { recursive: true })
    copyFileSync(source, destination)
  }
}
copyFiles(authoredFiles(primary))
copyFiles(generatedFiles(primary))

const dependencySymlinks = []
for (const relativeRoot of ["", "phone", "desk", "ratio"]) {
  const targetCandidate = join(primary, relativeRoot, "node_modules")
  if (!existsSync(targetCandidate)) continue
  const target = realpathSync(targetCandidate)
  const path = join(copyRoot, relativeRoot, "node_modules")
  mkdirSync(dirname(path), { recursive: true })
  symlinkSync(target, path, "dir")
  dependencySymlinks.push({ path: normalizedRelative(evidenceDir, path), target })
}

const CAstart = fingerprint(authoredFiles(copyRoot), copyRoot)
const CGstart = fingerprint(generatedFiles(copyRoot), copyRoot)
const commandCwd = join(copyRoot, packageConfig.relativeRoot)
const commandStartedAt = new Date().toISOString()
const commandResult = spawnSync("bash", ["-lc", packageConfig.command], {
  cwd: commandCwd,
  encoding: "utf8",
  maxBuffer: 128 * 1024 * 1024,
})
const commandEndedAt = new Date().toISOString()
writeFileSync(join(evidenceDir, "logs", "verify.stdout.txt"), commandResult.stdout ?? "")
writeFileSync(join(evidenceDir, "logs", "verify.stderr.txt"), commandResult.stderr ?? "")
const command = {
  id: `verify-${packageName}`,
  command: packageConfig.command,
  cwd: normalizedRelative(evidenceDir, commandCwd),
  startedAt: commandStartedAt,
  endedAt: commandEndedAt,
  exitCode: commandResult.status ?? 1,
  signal: commandResult.signal,
  stdoutPath: "logs/verify.stdout.txt",
  stderrPath: "logs/verify.stderr.txt",
}

const CAend = fingerprint(authoredFiles(copyRoot), copyRoot)
const CGend = fingerprint(generatedFiles(copyRoot), copyRoot)
const PAend = fingerprint(authoredFiles(primary), primary)
const PGend = fingerprint(generatedFiles(primary), primary)
const workspaceEnd = workspaceSnapshot(primary, evidenceDir)
const protectedEndProblems = protectedProblems(baseline, primary)
const fingerprints = { PAstart, PAend, CAstart, CAend, PGstart, PGend, CGstart, CGend }
const checks = [
  { id: "evidence-directory-fresh", passed: true },
  { id: "primary-authored-start-copy-start", passed: PAstart === CAstart },
  { id: "primary-generated-start-copy-start", passed: PGstart === CGstart },
  { id: "generated-protected-baseline", passed: PGstart === baseline.generatedFingerprint },
  { id: "copy-authored-retained", passed: CAstart === CAend },
  { id: "copy-generated-retained", passed: CGstart === CGend },
  { id: "primary-authored-retained", passed: PAstart === PAend },
  { id: "primary-generated-retained", passed: PGstart === PGend },
  { id: "protected-worktree-retained", passed: protectedStartProblems.length === 0 && protectedEndProblems.length === 0 },
  { id: "primary-output-confined", passed: workspaceStart === workspaceEnd },
  { id: `command-${command.id}`, passed: command.exitCode === 0 },
  { id: "dependency-symlinks-canonical", passed: dependencySymlinks.every((entry) => realpathSync(join(evidenceDir, entry.path)) === entry.target) },
  { id: "all-fingerprints-retained", passed: fingerprintsRetained(fingerprints, baseline.generatedFingerprint) },
]

const artifacts = artifactRecords(evidenceDir, manifestPath)
const exitCode = checks.every((entry) => entry.passed) ? 0 : 1
writeFileSync(manifestPath, `${JSON.stringify({
  version: 1,
  package: packageName,
  command: `EVIDENCE_DIR=${requestedEvidenceDir} node scripts/qa-harness/run-confined-verify.mjs ${packageName}`,
  canonicalWorkspace: primary,
  evidenceDir,
  startedAt,
  endedAt: new Date().toISOString(),
  exitCode,
  fingerprints,
  protectedGeneratedBaseline: baseline.generatedFingerprint,
  workspaceSnapshots: { start: workspaceStart, end: workspaceEnd },
  protected: { startProblems: protectedStartProblems, endProblems: protectedEndProblems },
  dependencySymlinks,
  commands: [command],
  checks,
  artifacts,
}, null, 2)}\n`)
process.exit(exitCode)
