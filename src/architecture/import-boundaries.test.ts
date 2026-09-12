import { describe, expect, test } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"
import { dirname, join, relative, resolve, sep } from "node:path"
import ts from "typescript"

const workspace = resolve(import.meta.dir, "../..")
const siblingRoots = ["desk/", "phone/", "ratio/"] as const

type ImportEdge = {
  readonly source: string
  readonly target: string
}

const posix = (path: string): string => path.split(sep).join("/")

const sourceFiles = (directory: string): readonly string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.(?:ts|js)$/.test(entry.name) ? [path] : []
  })

const importedSpecifiers = (path: string): readonly string[] => {
  const source = ts.createSourceFile(
    path,
    readFileSync(path, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    path.endsWith(".ts") ? ts.ScriptKind.TS : ts.ScriptKind.JS,
  )
  const specifiers: string[] = []
  const visit = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text)
    }
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1
    ) {
      const argument = node.arguments[0]
      if (argument !== undefined && ts.isStringLiteralLike(argument)) specifiers.push(argument.text)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return specifiers
}

const resolveEdge = (source: string, specifier: string): ImportEdge | null => {
  if (!specifier.startsWith(".")) return null
  return {
    source: posix(relative(workspace, source)),
    target: posix(relative(workspace, resolve(dirname(source), specifier))),
  }
}

const isSiblingTarget = (target: string): boolean =>
  siblingRoots.some((root) => target.startsWith(root))

export const importBoundaryViolation = (edge: ImportEdge): string | null => {
  const generatedTarget =
    edge.target.includes("/model/generated/") ||
    edge.target === "desk/src/createObjectModel.generated.ts"
  if (generatedTarget) return "authored source imports a generated model tree"
  if (edge.source.startsWith("src/apps/") && isSiblingTarget(edge.target)) {
    return "root application imports a standalone sibling package"
  }
  if (edge.source.startsWith("src/services/")) {
    const forbiddenRootLayer = /^(?:src\/(?:apps|assets|model)\/)/.test(edge.target)
    if (forbiddenRootLayer || isSiblingTarget(edge.target)) {
      return "service imports a model, asset, application, or standalone sibling"
    }
  }
  if (edge.source.startsWith("src/assets/") && isSiblingTarget(edge.target)) {
    const allowed =
      edge.target === "desk/src/createCyberDesk.ts" ||
      edge.target.startsWith("phone/src/model/") ||
      edge.target.startsWith("ratio/src/model/")
    if (!allowed) return "root adapter imports outside a sibling model boundary"
  }
  return null
}

describe("TypeScript AST import boundaries", () => {
  test("Given forbidden layer edges, when classified, then every locked rule is enforced", () => {
    const fixtures: readonly ImportEdge[] = [
      { source: "src/apps/main.ts", target: "phone/src/model/createPhoneModel" },
      { source: "src/services/media.ts", target: "src/apps/main-workspace-app" },
      { source: "src/services/media.ts", target: "ratio/src/model/createRadioModel" },
      { source: "src/assets/phone-asset.ts", target: "phone/src/viewer/createViewer" },
      {
        source: "src/assets/phone-asset.ts",
        target: "phone/src/model/generated/createNeonCyberphoneGenerated",
      },
    ]

    expect(
      fixtures.map(importBoundaryViolation).every((violation) => violation !== null),
    ).toBeTrue()
    expect(
      importBoundaryViolation({
        source: "src/assets/phone-asset.ts",
        target: "phone/src/model/createPhoneModel",
      }),
    ).toBeNull()
    expect(
      importBoundaryViolation({
        source: "src/assets/cyber-desk-asset-model.js",
        target: "desk/src/createCyberDesk.ts",
      }),
    ).toBeNull()
  })

  test("Given current authored root modules, when parsed by TypeScript AST, then no edge escapes", () => {
    const violations = sourceFiles(join(workspace, "src"))
      .filter((path) => !path.includes(".test."))
      .flatMap((source) =>
        importedSpecifiers(source).flatMap((specifier) => {
          const edge = resolveEdge(source, specifier)
          if (edge === null) return []
          const violation = importBoundaryViolation(edge)
          return violation === null ? [] : [`${edge.source} -> ${edge.target}: ${violation}`]
        }),
      )

    expect(violations).toEqual([])
  })
})
