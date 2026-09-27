/** Called with the new focus state whenever it changes. */
export type FocusListener = (focused: boolean) => void

/**
 * Wires a platform's focus signal into the manager. Receives a `setFocused`
 * callback to report changes and may return a cleanup function that detaches
 * whatever it attached.
 *
 * The web default listens to `visibilitychange` on `document`. React Native
 * replaces it with an AppState-backed signal from `@use-stellar/react-native`
 * — core never imports `react-native` itself.
 */
export type FocusEventSetup = (setFocused: (focused: boolean) => void) => (() => void) | void

/**
 * The web default: `document`'s `visibilitychange` event.
 *
 * Attaches nothing where there is no `document` — a server render or a native
 * app has no page visibility to track and is treated as focused until a
 * platform reports otherwise.
 */
const webFocusEvents: FocusEventSetup = setFocused => {
  if (typeof document === "undefined" || typeof document.addEventListener !== "function") return

  const handleChange = () => setFocused(document.visibilityState !== "hidden")
  document.addEventListener("visibilitychange", handleChange, false)

  return () => {
    document.removeEventListener("visibilitychange", handleChange)
  }
}

/**
 * Tracks whether the app is in the foreground, so polling hooks can stop
 * spending quota while nobody is looking and catch up when the user returns.
 *
 * Framework-neutral: no React, no React Native. A platform supplies its signal
 * through {@link FocusManager.setEventListener}; until it does, the web default
 * is used.
 */
export class FocusManager {
  /** `undefined` until a platform reports a state — then `document` is read. */
  private focused: boolean | undefined
  private listeners = new Set<FocusListener>()
  private setup: FocusEventSetup = webFocusEvents
  private cleanup: (() => void) | void = undefined

  /**
   * Returns `false` only when the platform says the app is in the background.
   * Environments with no signal at all (SSR, tests) are treated as focused.
   */
  isFocused(): boolean {
    if (this.focused !== undefined) return this.focused
    if (typeof document !== "undefined" && typeof document.visibilityState === "string") {
      return document.visibilityState !== "hidden"
    }
    return true
  }

  /**
   * Records a focus change. Listeners are notified only when the value
   * actually changes, so a repeated "active" event cannot trigger a second
   * round of refetches.
   */
  setFocused(focused: boolean): void {
    const previous = this.isFocused()
    this.focused = focused
    if (previous === focused) return

    for (const listener of this.listeners) {
      listener(focused)
    }
  }

  /**
   * Subscribes to focus changes. The platform signal is attached with the
   * first subscriber and detached with the last, so an app that never polls
   * never registers a listener.
   */
  subscribe(listener: FocusListener): () => void {
    this.listeners.add(listener)
    if (this.listeners.size === 1) this.attach()

    return () => {
      this.listeners.delete(listener)
      if (this.listeners.size === 0) this.detach()
    }
  }

  /**
   * Replaces the platform signal. Detaches the current one and, if anything is
   * subscribed, attaches the new one immediately. Pass nothing to restore the
   * web default.
   *
   * Any state the previous signal reported is dropped, so a signal that is
   * removed cannot leave the app stuck "in the background".
   */
  setEventListener(setup: FocusEventSetup = webFocusEvents): void {
    this.detach()
    this.setup = setup
    if (this.listeners.size > 0) this.attach()
  }

  private attach(): void {
    // Snapshot the state the signal starts from. A web `visibilitychange`
    // fires after `document.visibilityState` has already changed, so reading
    // it live would make the first change look like no change at all.
    this.focused = this.isFocused()
    this.cleanup = this.setup(focused => this.setFocused(focused))
  }

  private detach(): void {
    if (typeof this.cleanup === "function") this.cleanup()
    this.cleanup = undefined
    // Nothing reports changes any more, so a remembered state could only go
    // stale. Fall back to reading the platform until the next attach.
    this.focused = undefined
  }
}

/** The shared manager every polling hook consults. */
export const focusManager = new FocusManager()
