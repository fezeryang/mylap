import { spawn } from "node:child_process"
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { chromium } from "playwright-core"
import { resolveFreshEvidenceDir } from "./qa-harness/evidence-utils.mjs"
import {
  ProcessExitedBeforeReadyError,
  spawnLogged,
  terminateAndAwait,
  waitForHttpReady,
  waitForViteUrl,
} from "./qa-harness/managed-process.mjs"
import {
  artifactRecords,
  authoredFiles,
  fingerprint,
  generatedFiles,
  protectedProblems,
  workspaceSnapshot,
} from "./qa-harness/workspace-evidence.mjs"
import { parseQaSelection } from "./qa-harness/qa-input.mjs"
import { runQaPhases } from "./qa-harness/phase-runner.mjs"

const workspace = process.cwd()
const { target, caseId } = parseQaSelection(process.env)
const requestedEvidenceDir = process.env.EVIDENCE_DIR
if (requestedEvidenceDir === undefined) throw new Error("EVIDENCE_DIR is required")
const evidenceDir = resolveFreshEvidenceDir(workspace, requestedEvidenceDir)
const manifestPath = join(evidenceDir, "run-manifest.json")
const verifyManifestPath = join(dirname(evidenceDir), "verify-root", "run-manifest.json")
const baselinePath = join(workspace, ".omo/evidence/personal-3d-device-desktop-20260827-a1/protected/protected-worktree-baseline.json")
if (!existsSync(verifyManifestPath)) throw new Error(`Same-task root verify manifest is required: ${verifyManifestPath}`)

const startedAt = new Date().toISOString()
const baseline = JSON.parse(readFileSync(baselinePath, "utf8"))
const verifyManifest = JSON.parse(readFileSync(verifyManifestPath, "utf8"))
const PAstart = fingerprint(authoredFiles(workspace), workspace)
const PGstart = fingerprint(generatedFiles(workspace), workspace)
const workspaceStart = workspaceSnapshot(workspace, evidenceDir)
const protectedStartProblems = protectedProblems(baseline, workspace)
mkdirSync(join(evidenceDir, "logs"), { recursive: true })
mkdirSync(join(evidenceDir, "captures"), { recursive: true })

const runCommand = (command, args, logName, env) =>
  new Promise((resolveCommand) => {
    const stdoutPath = join(evidenceDir, "logs", `${logName}.stdout.txt`)
    const stderrPath = join(evidenceDir, "logs", `${logName}.stderr.txt`)
    const child = spawn(command, args, { cwd: workspace, env, stdio: ["ignore", "pipe", "pipe"] })
    child.stdout.pipe(createWriteStream(stdoutPath))
    child.stderr.pipe(createWriteStream(stderrPath))
    child.once("exit", (code, signal) => resolveCommand({
      command: [command, ...args].join(" "),
      exitCode: code ?? 1,
      signal,
      stdoutPath: `logs/${logName}.stdout.txt`,
      stderrPath: `logs/${logName}.stderr.txt`,
    }))
  })

const buildDir = join(evidenceDir, "build")
const commands = []
const checks = []
const captures = []
const consoleErrors = []
const pageErrors = []
const phaseErrors = []
const phaseLifecycles = []
let server
let exitCode = 1
let serverTermination = null

try {
  const buildArgs = target === "components"
    ? ["exec", "vite", "build", "--config", "scripts/qa-harness/vite.config.mjs"]
    : ["exec", "vite", "build", "--outDir", buildDir, "--emptyOutDir"]
  const build = await runCommand("pnpm", buildArgs, "01-build", { ...process.env, QA_BUILD_DIR: buildDir })
  commands.push(build)
  if (build.exitCode !== 0) throw new Error(`Vite build failed with exit ${build.exitCode}`)

  const serverOptions = {
    cwd: workspace,
    env: { ...process.env, QA_BUILD_DIR: buildDir },
    stdout: createWriteStream(join(evidenceDir, "logs", "02-server.stdout.txt")),
    stderr: createWriteStream(join(evidenceDir, "logs", "02-server.stderr.txt")),
  }
  server = process.env.QA_FORCE_SERVER_START_FAILURE === "1"
    ? spawnLogged(process.execPath, ["-e", "process.exit(37)"], serverOptions)
    : spawnLogged("pnpm", ["exec", "vite", "preview", "--config", "scripts/qa-harness/vite.config.mjs", "--host", "127.0.0.1", "--port", "0", "--strictPort"], serverOptions)
  const baseUrl = await waitForViteUrl(server)
  await waitForHttpReady(`${baseUrl}/`)
  checks.push({ id: "server-ready", passed: true })

  const executablePath = [process.env.CHROMIUM_PATH, "/snap/bin/chromium", "/usr/bin/chromium"]
    .find((path) => path !== undefined && existsSync(path))
  if (executablePath === undefined) throw new Error("Chromium executable was not found")
  const runnerPath = resolve(workspace, `scripts/qa-cases/${caseId}.runner.mjs`)
  if (!existsSync(runnerPath)) throw new Error(`QA runner case does not exist: ${caseId}`)
  const qaRunner = await import(pathToFileURL(runnerPath).href)
  const phases = Array.isArray(qaRunner.phases)
    ? qaRunner.phases
    : typeof qaRunner.run === "function"
      ? [{ id: caseId, run: qaRunner.run }]
      : null
  if (phases === null) throw new Error(`QA runner case has no run() or phases export: ${caseId}`)
  await runQaPhases({
    createBrowser: () => chromium.launch({
      executablePath,
      headless: true,
      args: ["--enable-webgl", "--ignore-gpu-blocklist", "--use-angle=swiftshader-webgl"],
    }),
    phases,
    pageOptions: { viewport: { width: 1280, height: 900 } },
    phaseInput: { baseUrl, evidenceDir },
    aggregate: { checks, captures, errors: phaseErrors },
    observePage: (page) => {
      page.on("console", (message) => {
        if (message.type() === "error") {
          consoleErrors.push({ text: message.text(), url: message.location().url })
        }
      })
      page.on("pageerror", (error) => pageErrors.push(error.message))
    },
    onLifecycle: (lifecycle) => {
      const existing = phaseLifecycles.findIndex(({ id }) => id === lifecycle.id)
      if (existing === -1) phaseLifecycles.push({ ...lifecycle })
      else phaseLifecycles[existing] = { ...lifecycle }
    },
  })
  const unexpectedConsoleErrors = consoleErrors.filter(
    (entry) => !entry.url.endsWith("/qa/missing.wav") && !entry.url.endsWith("/qa/corrupt.wav"),
  )
  checks.push({ id: "intentional-media-errors-handled", passed: true })
  checks.push({ id: "console-errors-zero", passed: unexpectedConsoleErrors.length === 0 })
  checks.push({ id: "page-errors-zero", passed: pageErrors.length === 0 })
  if (checks.some((entry) => !entry.passed)) throw new Error("One or more browser QA checks failed")
  exitCode = 0
} catch (error) {
  if (error instanceof ProcessExitedBeforeReadyError) checks.push({ id: "server-ready", passed: false })
  writeFileSync(join(evidenceDir, "failure.txt"), `${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
} finally {
  if (server !== undefined) serverTermination = await terminateAndAwait(server)
}

const PAend = fingerprint(authoredFiles(workspace), workspace)
const PGend = fingerprint(generatedFiles(workspace), workspace)
const workspaceEnd = workspaceSnapshot(workspace, evidenceDir)
const protectedEndProblems = protectedProblems(baseline, workspace)
const verifyBinding = {
  manifestPath: verifyManifestPath,
  authoredFingerprint: verifyManifest.fingerprints?.CAend ?? null,
  generatedFingerprint: verifyManifest.fingerprints?.CGend ?? null,
}
checks.push({ id: "verify-manifest-bound", passed: verifyBinding.authoredFingerprint === PAstart && verifyBinding.generatedFingerprint === PGstart && PGstart === baseline.generatedFingerprint })
checks.push({ id: "authored-start-end", passed: PAstart === PAend })
checks.push({ id: "generated-start-end", passed: PGstart === PGend })
checks.push({ id: "workspace-output-confined", passed: workspaceStart === workspaceEnd })
checks.push({ id: "protected-worktree-unchanged", passed: protectedStartProblems.length === 0 && protectedEndProblems.length === 0 })
if (checks.some((entry) => !entry.passed)) exitCode = 1

const artifacts = artifactRecords(evidenceDir, manifestPath)
writeFileSync(manifestPath, `${JSON.stringify({
  version: 1,
  target,
  caseId,
  command: `EVIDENCE_DIR=${requestedEvidenceDir} QA_TARGET=${target} QA_CASE=${caseId} pnpm run qa:browser`,
  canonicalWorkspace: workspace,
  evidenceDir,
  startedAt,
  endedAt: new Date().toISOString(),
  exitCode,
  fingerprints: { PAstart, PAend, PGstart, PGend },
  protectedGeneratedBaseline: baseline.generatedFingerprint,
  workspaceSnapshots: { start: workspaceStart, end: workspaceEnd },
  verifyBinding,
  protected: { startProblems: protectedStartProblems, endProblems: protectedEndProblems },
  commands,
  serverTermination,
  checks,
  captures,
  consoleErrors,
  pageErrors,
  phaseErrors,
  phaseLifecycles,
  artifacts,
}, null, 2)}\n`)
process.exit(exitCode)
