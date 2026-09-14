/**
 * Application-wide constants for the TODŌU workspace
 * Extracted magic numbers for maintainability and consistency
 */

// ============================================================================
// TIMING
// ============================================================================

/**
 * Clock and time-related update intervals (in milliseconds)
 */
export const TIMING = {
  /** Clock update interval for both desktop and phone OS (15 seconds) */
  CLOCK_UPDATE_INTERVAL: 15_000,

  /** Standard polling interval for general updates */
  STANDARD_POLLING: 30_000,

  /** Fast polling for real-time features */
  FAST_POLLING: 5_000,
} as const

/**
 * Animation and transition durations (in milliseconds)
 */
export const ANIMATION_DURATION = {
  /** Window/modal open animation */
  WINDOW_OPEN: 240,

  /** Phone app screen transition */
  PHONE_TRANSITION: 260,

  /** Quick overlay animations */
  OVERLAY: 220,

  /** Dock item hover transition */
  DOCK_HOVER: 160,

  /** Reduced motion duration (accessibility) */
  REDUCED_MOTION: 0.01,
} as const

// ============================================================================
// ANIMATIONS
// ============================================================================

/**
 * CSS easing functions for consistent motion
 */
export const EASING = {
  /** Standard ease for most UI transitions */
  STANDARD: "cubic-bezier(0.2, 0.8, 0.2, 1)",

  /** Ease out for elements entering */
  EASE_OUT: "ease",

  /** Ease in-out for smooth bidirectional animations */
  EASE_IN_OUT: "ease",
} as const

// ============================================================================
// Z_INDEX
// ============================================================================

/**
 * Z-index layering system
 * Ensures consistent stacking throughout the application
 */
export const Z_INDEX = {
  /** Base content layer */
  BASE: 1,

  /** Phone OS status bar */
  PHONE_STATUS: 20,

  /** Phone OS overlays (library, switcher) */
  PHONE_OVERLAY: 25,

  /** Phone OS home indicator */
  PHONE_INDICATOR: 30,

  /** Desktop menubar and dock */
  DESKTOP_CHROME: 500,

  /** Search and modal overlays */
  MODAL: 600,
} as const

// ============================================================================
// OPACITY
// ============================================================================

/**
 * Standard opacity values for consistent visual hierarchy
 */
export const OPACITY = {
  /** Disabled state */
  DISABLED: 0.4,

  /** Disabled state (alternate) */
  DISABLED_ALT: 0.45,

  /** Muted/secondary content */
  MUTED: 0.75,

  /** De-emphasized content */
  SECONDARY: 0.6,

  /** Faded content */
  FADED: 0.3,

  /** Subtle overlay */
  SUBTLE: 0.5,

  /** Fully visible */
  FULL: 1,

  /** Hidden */
  HIDDEN: 0,
} as const

// ============================================================================
// BORDER_RADIUS
// ============================================================================

/**
 * Border radius values for consistent rounded corners
 */
export const BORDER_RADIUS = {
  /** Extra small - chips, tags */
  XS: 6,

  /** Small - buttons, inputs */
  SM: 7,

  /** Small-medium - cards, inputs */
  SM_MD: 8,

  /** Medium - cards, panels */
  MD: 10,

  /** Medium-large - modals */
  MD_LG: 12,

  /** Large - windows, major sections */
  LG: 13,

  /** Extra large - major UI containers */
  XL: 20,

  /** 2XL - prominent containers */
  XXL: 22,

  /** 3XL - hero sections */
  XXXL: 23,

  /** 4XL - major viewports */
  XXXXL: 24,

  /** Dock - highly rounded */
  DOCK: 29,

  /** Island - very rounded */
  ISLAND: 30,

  /** Pill - fully rounded ends */
  PILL: 99,

  /** Pill max - maximum rounded */
  PILL_MAX: 999,

  /** Circle - perfect circle */
  CIRCLE: "50%",
} as const

// ============================================================================
// LAYOUT
// ============================================================================

/**
 * Standard spacing scale (in pixels)
 */
export const SPACING = {
  /** Extra small spacing */
  XS: 4,

  /** Small spacing */
  SM: 8,

  /** Medium spacing */
  MD: 16,

  /** Large spacing */
  LG: 24,

  /** Extra large spacing */
  XL: 32,

  /** 2XL spacing */
  XXL: 48,
} as const

/**
 * Common UI element sizes
 */
export const SIZE = {
  /** Icon button size */
  ICON_BUTTON: 34,

  /** Standard button min height */
  BUTTON_HEIGHT: 36,

  /** Large button min height */
  BUTTON_HEIGHT_LG: 48,

  /** App icon size (dock) */
  APP_ICON: 52,

  /** Menubar height */
  MENUBAR_HEIGHT: 32,

  /** Dock height */
  DOCK_HEIGHT: 80,

  /** Phone status bar height */
  PHONE_STATUS_HEIGHT: 45,

  /** Phone home indicator height */
  PHONE_INDICATOR_HEIGHT: 22,
} as const

/**
 * Viewport breakpoints for responsive design (container queries)
 */
export const BREAKPOINT = {
  /** Mobile phone width */
  MOBILE: 480,

  /** Tablet width */
  TABLET: 600,

  /** Small desktop */
  DESKTOP_SM: 768,

  /** Medium desktop */
  DESKTOP_MD: 1024,

  /** Large desktop */
  DESKTOP_LG: 1440,
} as const

// ============================================================================
// TYPE EXPORTS
// ============================================================================

/**
 * Type-safe constant value types
 */
export type TimingValue = (typeof TIMING)[keyof typeof TIMING]
export type AnimationDurationValue = (typeof ANIMATION_DURATION)[keyof typeof ANIMATION_DURATION]
export type EasingValue = (typeof EASING)[keyof typeof EASING]
export type ZIndexValue = (typeof Z_INDEX)[keyof typeof Z_INDEX]
export type OpacityValue = (typeof OPACITY)[keyof typeof OPACITY]
export type BorderRadiusValue = (typeof BORDER_RADIUS)[keyof typeof BORDER_RADIUS]
export type SpacingValue = (typeof SPACING)[keyof typeof SPACING]
export type SizeValue = (typeof SIZE)[keyof typeof SIZE]
export type BreakpointValue = (typeof BREAKPOINT)[keyof typeof BREAKPOINT]
