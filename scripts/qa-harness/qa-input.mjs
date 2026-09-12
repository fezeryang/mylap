const QA_TARGETS = new Set(["components", "product"])
const VERIFY_PACKAGES = {
  root: { relativeRoot: "", command: "pnpm run verify:root" },
  phone: { relativeRoot: "phone", command: "pnpm run verify" },
  desk: { relativeRoot: "desk", command: "pnpm run verify" },
  ratio: { relativeRoot: "ratio", command: "pnpm run verify" },
}

export const parseQaSelection = (environment) => {
  const target = environment.QA_TARGET
  const caseId = environment.QA_CASE
  if (!QA_TARGETS.has(target)) throw new Error("QA_TARGET must be components or product")
  if (typeof caseId !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(caseId)) {
    throw new Error("QA_CASE must be a kebab-case identifier")
  }
  return { target, caseId }
}

export const parseVerifyPackage = (value) => {
  const packageConfig = VERIFY_PACKAGES[value]
  if (packageConfig === undefined) throw new Error("Package must be root, phone, desk, or ratio")
  return { name: value, ...packageConfig }
}
