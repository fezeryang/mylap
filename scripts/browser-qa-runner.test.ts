import { describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { spawn } from "node:child_process"
import { createWriteStream } from "node:fs"
import { copyFile, mkdir, mkdtemp, readFile, readdir, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { selectQaCaseImporter, UnknownQaCaseError } from "./qa-harness/case-selection"
import {
  checksPassInOrder,
  compareUtf8,
  fingerprintsRetained,
  resolveFreshEvidenceDir,
} from "./qa-harness/evidence-utils.mjs"
import {
  ProcessExitedBeforeReadyError,
  terminateAndAwait,
  waitForHttpReady,
  waitForViteUrl,
} from "./qa-harness/managed-process.mjs"
import { parseQaSelection, parseVerifyPackage } from "./qa-harness/qa-input.mjs"
import { runQaPhases } from "./qa-harness/phase-runner.mjs"
import { phases as productFullPhases } from "./qa-cases/product-full.runner.mjs"
import type { QaCaseModule } from "./qa-harness/qa-case-contract"
import {
  authoredFiles,
  fingerprint,
  generatedFiles,
  normalizedRelative,
} from "./qa-harness/workspace-evidence.mjs"

describe("browser QA evidence boundary", () => {
  test("sorts paths by raw UTF-8 bytes instead of locale", () => {
    const paths = ["z", "ä", "a"]
    expect([...paths].sort(compareUtf8)).toEqual(["a", "z", "ä"])
  })

  test("rejects stale evidence and a symlink escape", async () => {
    const root = await mkdtemp(join(tmpdir(), "todou-runner-workspace-"))
    const stale = join(root, ".omo/evidence/task/stale")
    await mkdir(stale, { recursive: true })
    expect(() => resolveFreshEvidenceDir(root, stale)).toThrow("must be fresh")

    const outside = await mkdtemp(join(tmpdir(), "todou-runner-outside-"))
    const link = join(root, ".omo/evidence/escape")
    await mkdir(join(root, ".omo/evidence"), { recursive: true })
    await symlink(outside, link)
    expect(() => resolveFreshEvidenceDir(root, join(link, "run"))).toThrow("escapes workspace")
    expect(await readdir(outside)).toEqual([])
  })

  test("fingerprints raw UTF-8 sorted path and hash tuples", async () => {
    const root = await mkdtemp(join(tmpdir(), "todou-fingerprint-"))
    const first = join(root, "z")
    const second = join(root, "ä")
    await writeFile(first, "first")
    await writeFile(second, "second")
    const fileHash = (value: string) => createHash("sha256").update(value).digest("hex")
    const expected = createHash("sha256")
      .update(`z\0${fileHash("first")}\nä\0${fileHash("second")}\n`)
      .digest("hex")
    expect(fingerprint([second, first].sort((left, right) => compareUtf8(left, right)), root)).toBe(expected)
  })

  test("excludes nested tool and generated inputs from authored selection and copies", async () => {
    const root = await mkdtemp(join(tmpdir(), "todou-authored-selector-"))
    const copyRoot = await mkdtemp(join(tmpdir(), "todou-authored-copy-"))
    const fixtures = new Map([
      ["package.json", "{}"],
      ["desk/src/normal.ts", "export const normal = true"],
      ["desk/.img2threejs/tool-state.json", "tool state"],
      ["desk/src/nested/.img2threejs/private.json", "nested tool state"],
      ["desk/.img2threejs-backup/keep.ts", "export const retained = true"],
      ["desk/src/createObjectModel.generated.ts", "generated desk"],
      ["phone/src/model/generated/phone.ts", "generated phone"],
      ["ratio/src/model/generated/radio.ts", "generated ratio"],
      ["archive-cyberdeck/reference.ts", "archived"],
      ["desk/detail-evidence/render.json", "evidence"],
      ["desk/src/parts.json", "generated manifest"],
      ["desk/src/parts.json.keep.ts", "export const similarlyNamed = true"],
    ])
    for (const [path, contents] of fixtures) {
      const destination = join(root, path)
      await mkdir(join(destination, ".."), { recursive: true })
      await writeFile(destination, contents)
    }

    const selected = authoredFiles(root)
    for (const source of selected) {
      const relativePath = normalizedRelative(root, source)
      const destination = join(copyRoot, relativePath)
      await mkdir(join(destination, ".."), { recursive: true })
      await copyFile(source, destination)
    }

    expect(selected.map((path) => normalizedRelative(root, path))).toEqual([
      "desk/.img2threejs-backup/keep.ts",
      "desk/src/normal.ts",
      "desk/src/parts.json.keep.ts",
      "package.json",
    ])
    expect(fingerprint(selected, root)).toBe(
      fingerprint(authoredFiles(copyRoot), copyRoot),
    )
    expect(await Bun.file(join(copyRoot, "desk/.img2threejs/tool-state.json")).exists()).toBe(false)
    expect(generatedFiles(root).map((path) => normalizedRelative(root, path))).toEqual([
      "desk/src/createObjectModel.generated.ts",
      "phone/src/model/generated/phone.ts",
      "ratio/src/model/generated/radio.ts",
    ])
  })

  test("parses exact QA target, case, and confined package boundaries", () => {
    expect(parseQaSelection({ QA_TARGET: "components", QA_CASE: "fixture-foundation" })).toEqual({
      target: "components",
      caseId: "fixture-foundation",
    })
    expect(parseQaSelection({ QA_TARGET: "product", QA_CASE: "full" })).toEqual({
      target: "product",
      caseId: "full",
    })
    for (const environment of [
      { QA_TARGET: "component", QA_CASE: "fixture-foundation" },
      { QA_TARGET: "components", QA_CASE: "../fixture" },
      { QA_TARGET: "components", QA_CASE: "fixture;touch-file" },
      { QA_TARGET: "components", QA_CASE: "" },
    ]) {
      expect(() => parseQaSelection(environment)).toThrow()
    }
    expect(["root", "phone", "desk", "ratio"].map((value) => parseVerifyPackage(value))).toEqual([
      { name: "root", relativeRoot: "", command: "pnpm run verify:root" },
      { name: "phone", relativeRoot: "phone", command: "pnpm run verify" },
      { name: "desk", relativeRoot: "desk", command: "pnpm run verify" },
      { name: "ratio", relativeRoot: "ratio", command: "pnpm run verify" },
    ])
    expect(() => parseVerifyPackage("unknown")).toThrow("root, phone, desk, or ratio")
  })

  test("selects a component case lazily and rejects an unknown route", async () => {
    let importCount = 0
    const module: QaCaseModule = { caseId: "fixture-foundation", mount: () => undefined }
    const importers = {
      "../qa-cases/fixture-foundation.case.ts": async () => {
        importCount += 1
        return module
      },
    }
    const importer = selectQaCaseImporter(importers, "fixture-foundation")
    expect(importCount).toBe(0)
    expect(await importer()).toBe(module)
    expect(importCount).toBe(1)
    expect(() => selectQaCaseImporter(importers, "future-case")).toThrow(UnknownQaCaseError)
  })

  test("validates ordered binary checks and all retained fingerprints", () => {
    const checks = [
      { id: "build", passed: true },
      { id: "server-ready", passed: true },
    ]
    expect(checksPassInOrder(checks, ["build", "server-ready"])).toBe(true)
    expect(checksPassInOrder(checks, ["server-ready", "build"])).toBe(false)
    expect(checksPassInOrder([{ id: "build", passed: false }], ["build"])).toBe(false)
    const retained = {
      PAstart: "authored",
      PAend: "authored",
      CAstart: "authored",
      CAend: "authored",
      PGstart: "generated",
      PGend: "generated",
      CGstart: "generated",
      CGend: "generated",
    }
    expect(fingerprintsRetained(retained, "generated")).toBe(true)
    expect(fingerprintsRetained({ ...retained, CAend: "changed" }, "generated")).toBe(false)
  })

  test("settles forced server startup failure and leaves no orphan", async () => {
    const child = spawn(process.execPath, ["-e", "process.exit(37)"], {
      stdio: ["ignore", "pipe", "pipe"],
    })
    try {
      await expect(waitForViteUrl(child)).rejects.toMatchObject({
        name: "ProcessExitedBeforeReadyError",
        exitCode: 37,
      })
    } finally {
      expect(await terminateAndAwait(child)).toEqual({ code: 37, signal: null })
    }
    expect(() => process.kill(child.pid ?? -1, 0)).toThrow()
    expect(new ProcessExitedBeforeReadyError(37).message).toContain("37")
  })

  test("bounds readiness timeout and cleans up a nonresponsive server", async () => {
    const child = spawn(
      process.execPath,
      [
        "-e",
        "const h=require('node:http').createServer(()=>{});h.listen(0,'127.0.0.1',()=>console.log('http://127.0.0.1:'+h.address().port))",
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    )
    const startedAt = performance.now()
    try {
      const url = await waitForViteUrl(child)
      await expect(waitForHttpReady(url, 100)).rejects.toThrow("Timed out waiting")
    } finally {
      await terminateAndAwait(child)
    }
    expect(performance.now() - startedAt).toBeLessThan(1000)
    expect(() => process.kill(child.pid ?? -1, 0)).toThrow()
  })

  test("waits for readiness and terminates the real server after use", async () => {
    const root = await mkdtemp(join(tmpdir(), "todou-managed-server-"))
    const child = spawn(
      process.execPath,
      [
        "-e",
        "const h=require('node:http').createServer((q,r)=>r.end('ready'));h.listen(0,'127.0.0.1',()=>console.log('http://127.0.0.1:'+h.address().port))",
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    )
    child.stdout.pipe(createWriteStream(join(root, "server.stdout.txt")))
    child.stderr.pipe(createWriteStream(join(root, "server.stderr.txt")))
    try {
      const url = await waitForViteUrl(child)
      await waitForHttpReady(url)
      expect(await (await fetch(url)).text()).toBe("ready")
    } finally {
      const termination = await terminateAndAwait(child)
      expect(termination.signal).toBe("SIGTERM")
    }
    expect(() => process.kill(child.pid ?? -1, 0)).toThrow()
    expect((await readFile(join(root, "server.stdout.txt"), "utf8")).includes("127.0.0.1")).toBe(true)
  })

  test("runs product phases in fresh contexts and aggregates ordered unique evidence", async () => {
    const closed: string[] = []
    const closedBrowsers: string[] = []
    let contextCount = 0
    const browser = {
      newContext: async () => {
        contextCount += 1
        const contextId = `context-${contextCount}`
        const listeners = new Map<string, (value: { message: string }) => void>()
        return {
          newPage: async () => ({
            contextId,
            on: (event: string, listener: (value: { message: string }) => void) => {
              listeners.set(event, listener)
            },
            emit: (event: string, value: { message: string }) => listeners.get(event)?.(value),
          }),
          close: async () => {
            closed.push(contextId)
          },
        }
      },
    }
    const phases = [
      {
        id: "visual-capture",
        run: async ({ page }: { page: { contextId: string } }) => ({
          checks: [{ id: `check-${page.contextId}`, passed: true }],
          captures: ["captures/visual.png"],
        }),
      },
      {
        id: "functional-recovery",
        run: async ({ page }: { page: { contextId: string } }) => ({
          checks: [{ id: `check-${page.contextId}`, passed: true }],
          captures: ["captures/functional.png"],
          errors: [{ type: "handled", message: "expected recovery" }],
        }),
      },
    ]
    let browserCount = 0
    const createBrowser = async () => {
      browserCount += 1
      const browserId = `browser-${browserCount}`
      return {
        ...browser,
        close: async () => {
          closedBrowsers.push(browserId)
        },
      }
    }

    const result = await runQaPhases({ createBrowser, phases, pageOptions: { viewport: { width: 1280, height: 900 } } })

    expect(result.checks.map(({ id }) => id)).toEqual(["check-context-1", "check-context-2"])
    expect(result.captures).toEqual(["captures/visual.png", "captures/functional.png"])
    expect(result.errors).toEqual([{ type: "handled", message: "expected recovery" }])
    expect(result.lifecycles.map(({ id, browserOrdinal, contextClosed, browserClosed }) => ({
      id,
      browserOrdinal,
      contextClosed,
      browserClosed,
    }))).toEqual([
      { id: "visual-capture", browserOrdinal: 1, contextClosed: true, browserClosed: true },
      { id: "functional-recovery", browserOrdinal: 2, contextClosed: true, browserClosed: true },
    ])
    expect(closed).toEqual(["context-1", "context-2"])
    expect(closedBrowsers).toEqual(["browser-1", "browser-2"])
    expect(new Set(result.checks.map(({ id }) => id)).size).toBe(result.checks.length)
  })

  test("partitions radio and browser journeys into distinct fresh-browser phases", () => {
    const phaseIds = productFullPhases.map(({ id }) => id)
    expect(phaseIds).not.toContain("functional-media-browser")
    expect(phaseIds).toContain("functional-media-radio")
    expect(phaseIds).toContain("functional-browser")
    expect(phaseIds.indexOf("functional-browser")).toBe(
      phaseIds.indexOf("functional-media-radio") + 1,
    )
  })

  test("closes a launched phase browser when context setup or teardown rejects", async () => {
    const setupClosed: string[] = []
    await expect(
      runQaPhases({
        createBrowser: async () => ({
          newContext: async () => {
            throw new Error("context setup failed")
          },
          close: async () => {
            setupClosed.push("browser")
          },
        }),
        phases: [{ id: "setup-failure", run: async () => ({ checks: [], captures: [] }) }],
        pageOptions: {},
      }),
    ).rejects.toThrow("context setup failed")
    expect(setupClosed).toEqual(["browser"])

    const teardownClosed: string[] = []
    await expect(
      runQaPhases({
        createBrowser: async () => ({
          newContext: async () => ({
            newPage: async () => ({}),
            close: async () => {
              throw new Error("context teardown failed")
            },
          }),
          close: async () => {
            teardownClosed.push("browser")
          },
        }),
        phases: [{ id: "teardown-failure", run: async () => ({ checks: [], captures: [] }) }],
        pageOptions: {},
      }),
    ).rejects.toThrow("context teardown failed")
    expect(teardownClosed).toEqual(["browser"])
  })
})
