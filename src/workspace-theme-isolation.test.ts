import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const projectRoot = join(import.meta.dir, "..")

describe("workspace theme production isolation", () => {
  test("Given the current root entry points, when the component showcase is introduced, then production does not load it", () => {
    const documentSource = readFileSync(join(projectRoot, "index.html"), "utf8")
    const mainSource = readFileSync(join(projectRoot, "src/main.ts"), "utf8")

    expect(documentSource).not.toContain("workspace-theme")
    expect(mainSource).not.toContain("workspace-theme")
    expect(documentSource).not.toContain("workspace-showcase")
  })

  test("Given every workspace root token, when the design authority is read, then every token is documented", () => {
    const themeSource = readFileSync(join(projectRoot, "src/workspace-theme.css"), "utf8")
    const designSource = readFileSync(join(projectRoot, "DESIGN.md"), "utf8")
    const rootBlock = themeSource.match(/:root\s*\{([\s\S]*?)\n\}/u)?.[1]
    if (rootBlock === undefined) throw new Error("Workspace root token block is missing")
    const declarations = [
      ...rootBlock.matchAll(/(--workspace-[a-z0-9-]+)\s*:\s*([^;]+);/gu),
    ].flatMap((match) => {
      const token = match[1]
      const value = match[2]
      return token === undefined || value === undefined ? [] : [{ token, value: value.trim() }]
    })
    const authoritySection = designSource.split("## 9. Light Workspace Stage Contract", 2)[1]
    if (authoritySection === undefined) {
      throw new Error("Todo16 design authority section is missing")
    }
    const undocumented = declarations.filter(
      ({ token, value }) =>
        !authoritySection.includes(`\`${token}\``) || !authoritySection.includes(value),
    )
    expect(undocumented).toEqual([])
  })
})
