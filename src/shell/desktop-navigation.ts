export type DesktopNavigationState =
  | "landing"
  | "entering"
  | "overview"
  | "focusing-phone"
  | "focusing-computer"
  | "focusing-radio"
  | "phone-focus"
  | "computer-focus"
  | "radio-focus"
  | "returning"

export type DesktopNavigationRequest =
  | "enter"
  | "focus-phone"
  | "focus-computer"
  | "focus-radio"
  | "return-overview"

export type DesktopNavigationPose = {
  readonly position: readonly [number, number, number]
  readonly target: readonly [number, number, number]
}

export const DESKTOP_NAVIGATION_POSES = {
  computer: { position: [0, 4.03, -5.87], target: [0, 0.8, 0] },
  landing: { position: [-5, 12, -38], target: [-5, -0.8, 0] },
  overview: { position: [-11, 10, -34], target: [-5, -0.8, 0] },
  phone: { position: [-3.1, 2.7, 2.19], target: [-3, 0.15, 0] },
  radio: { position: [3.05, 2.15, -2.85], target: [3, 0.35, 0] },
} as const satisfies Readonly<Record<string, DesktopNavigationPose>>

export type DesktopNavigationSnapshot = {
  readonly interactionLocked: boolean
  readonly pose: DesktopNavigationPose
  readonly progress: number
  readonly state: DesktopNavigationState
}

export type DesktopNavigationController = {
  advance(timestampMilliseconds: number): void
  dispose(): void
  read(): DesktopNavigationSnapshot
  request(request: DesktopNavigationRequest): void
}

export type DesktopNavigationControllerOptions = {
  readonly onInteractionLockChange?: (locked: boolean) => void
  readonly onSettled?: (state: DesktopNavigationState) => void
  readonly reducedMotion: boolean
}

type StableNavigationState =
  | "landing"
  | "overview"
  | "phone-focus"
  | "computer-focus"
  | "radio-focus"

type Transition = {
  readonly destinationPose: DesktopNavigationPose
  readonly destinationState: StableNavigationState
  readonly durationMilliseconds: number
  readonly startedAtMilliseconds: number
  readonly startPose: DesktopNavigationPose
  readonly state: Exclude<DesktopNavigationState, StableNavigationState>
}

const assertNever = (value: never): never => {
  throw new TypeError(`Unexpected desktop navigation variant: ${String(value)}`)
}

const requestDefinition = (
  request: DesktopNavigationRequest,
): Pick<Transition, "destinationPose" | "destinationState" | "durationMilliseconds" | "state"> => {
  switch (request) {
    case "enter":
      return {
        destinationPose: DESKTOP_NAVIGATION_POSES.overview,
        destinationState: "overview",
        durationMilliseconds: 1600,
        state: "entering",
      }
    case "focus-phone":
      return {
        destinationPose: DESKTOP_NAVIGATION_POSES.phone,
        destinationState: "phone-focus",
        durationMilliseconds: 650,
        state: "focusing-phone",
      }
    case "focus-computer":
      return {
        destinationPose: DESKTOP_NAVIGATION_POSES.computer,
        destinationState: "computer-focus",
        durationMilliseconds: 650,
        state: "focusing-computer",
      }
    case "focus-radio":
      return {
        destinationPose: DESKTOP_NAVIGATION_POSES.radio,
        destinationState: "radio-focus",
        durationMilliseconds: 650,
        state: "focusing-radio",
      }
    case "return-overview":
      return {
        destinationPose: DESKTOP_NAVIGATION_POSES.overview,
        destinationState: "overview",
        durationMilliseconds: 650,
        state: "returning",
      }
    default:
      return assertNever(request)
  }
}

const interpolateVector = (
  from: readonly [number, number, number],
  to: readonly [number, number, number],
  progress: number,
): readonly [number, number, number] => [
  from[0] + (to[0] - from[0]) * progress,
  from[1] + (to[1] - from[1]) * progress,
  from[2] + (to[2] - from[2]) * progress,
]

const interpolatePose = (
  from: DesktopNavigationPose,
  to: DesktopNavigationPose,
  progress: number,
): DesktopNavigationPose => ({
  position: interpolateVector(from.position, to.position, progress),
  target: interpolateVector(from.target, to.target, progress),
})

export const cubicInOut = (progress: number): number =>
  progress < 0.5 ? 4 * progress * progress * progress : 1 - (-2 * progress + 2) ** 3 / 2

export const createDesktopNavigationController = (
  options: DesktopNavigationControllerOptions,
): DesktopNavigationController => {
  let state: DesktopNavigationState = "landing"
  let pose: DesktopNavigationPose = DESKTOP_NAVIGATION_POSES.landing
  let progress = 1
  let transition: Transition | null = null
  let lastTimestampMilliseconds: number | null = null
  let interactionLocked = false
  let disposed = false

  const setInteractionLocked = (locked: boolean): void => {
    if (interactionLocked === locked) return
    interactionLocked = locked
    options.onInteractionLockChange?.(locked)
  }

  const settle = (definition: ReturnType<typeof requestDefinition>): void => {
    transition = null
    state = definition.destinationState
    pose = definition.destinationPose
    progress = 1
    setInteractionLocked(false)
    options.onSettled?.(state)
  }

  return {
    advance: (timestampMilliseconds) => {
      if (
        disposed ||
        !Number.isFinite(timestampMilliseconds) ||
        timestampMilliseconds < 0 ||
        (lastTimestampMilliseconds !== null && timestampMilliseconds <= lastTimestampMilliseconds)
      ) {
        return
      }
      lastTimestampMilliseconds = timestampMilliseconds
      if (transition === null) return
      progress = Math.min(
        1,
        (timestampMilliseconds - transition.startedAtMilliseconds) /
          transition.durationMilliseconds,
      )
      pose = interpolatePose(transition.startPose, transition.destinationPose, cubicInOut(progress))
      if (progress < 1) return
      settle(transition)
    },
    dispose: () => {
      if (disposed) return
      disposed = true
      transition = null
      setInteractionLocked(false)
    },
    read: () => ({ interactionLocked, pose, progress, state }),
    request: (request) => {
      if (disposed) return
      const definition = requestDefinition(request)
      if (transition === null && state === definition.destinationState) return
      if (options.reducedMotion) {
        settle(definition)
        return
      }
      transition = {
        ...definition,
        startedAtMilliseconds: lastTimestampMilliseconds ?? 0,
        startPose: pose,
      }
      state = definition.state
      progress = 0
      setInteractionLocked(true)
    },
  }
}
