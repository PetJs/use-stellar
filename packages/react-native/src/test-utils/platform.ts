/**
 * Surface check that RN hook tests never touch the web DOM.
 */
export function assertNoDomGlobals(): void {
  expect(typeof window).toBe("undefined")
  expect(typeof document).toBe("undefined")
}
