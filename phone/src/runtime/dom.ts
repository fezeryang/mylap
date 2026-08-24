export class DomContractError extends Error {
  override readonly name = "DomContractError"
}

export function requireElement<T extends Element>(id: string, elementType: { new (): T }): T {
  const element = document.getElementById(id)
  if (!(element instanceof elementType)) {
    throw new DomContractError(`Required #${id} does not match ${elementType.name}`)
  }
  return element
}
