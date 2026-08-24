export const element = <Tag extends keyof HTMLElementTagNameMap>(
  tag: Tag,
  className: string,
  text?: string,
): HTMLElementTagNameMap[Tag] => {
  const node = document.createElement(tag)
  node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

export const svgElement = <Tag extends keyof SVGElementTagNameMap>(
  tag: Tag,
  attributes: Readonly<Record<string, string>>,
): SVGElementTagNameMap[Tag] => {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag)
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value)
  return node
}

export const listen = <EventName extends keyof HTMLElementEventMap>(
  target: HTMLElement,
  eventName: EventName,
  listener: (event: HTMLElementEventMap[EventName]) => void,
): (() => void) => {
  target.addEventListener(eventName, listener)
  return () => target.removeEventListener(eventName, listener)
}
