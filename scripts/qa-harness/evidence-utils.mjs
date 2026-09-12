import { existsSync, realpathSync } from "node:fs"
import { dirname, isAbsolute, relative, resolve } from "node:path"

export const compareUtf8 = (left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right))

const isWithin = (parent, child) => {
  const path = relative(parent, child)
  return path === "" || (!path.startsWith("..") && !isAbsolute(path))
}

const nearestExistingAncestor = (path) => {
  let candidate = path
  while (!existsSync(candidate)) {
    const parent = dirname(candidate)
    if (parent === candidate) break
    candidate = parent
  }
  return candidate
}

export const resolveFreshEvidenceDir = (workspace, requested) => {
  const canonicalWorkspace = realpathSync(workspace)
  const evidenceDir = resolve(canonicalWorkspace, requested)
  if (existsSync(evidenceDir)) throw new Error(`Evidence directory must be fresh: ${evidenceDir}`)
  const ancestor = nearestExistingAncestor(dirname(evidenceDir))
  const canonicalAncestor = realpathSync(ancestor)
  if (!isWithin(canonicalWorkspace, canonicalAncestor)) {
    throw new Error(`Evidence directory escapes workspace through a symlink: ${evidenceDir}`)
  }
  if (!isWithin(canonicalWorkspace, evidenceDir)) {
    throw new Error(`Evidence directory escapes workspace: ${evidenceDir}`)
  }
  return evidenceDir
}

export const checksPassInOrder = (checks, expectedIds) =>
  checks.length === expectedIds.length &&
  checks.every((check, index) => check.id === expectedIds[index] && check.passed === true)

export const fingerprintsRetained = (fingerprints, protectedGeneratedBaseline) =>
  fingerprints.PAstart === fingerprints.PAend &&
  fingerprints.PAstart === fingerprints.CAstart &&
  fingerprints.PAstart === fingerprints.CAend &&
  fingerprints.PGstart === fingerprints.PGend &&
  fingerprints.PGstart === fingerprints.CGstart &&
  fingerprints.PGstart === fingerprints.CGend &&
  fingerprints.PGstart === protectedGeneratedBaseline
