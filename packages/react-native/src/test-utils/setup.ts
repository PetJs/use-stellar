import { resetAllMocks } from "./mocks/runtime"

jest.useFakeTimers()

beforeEach(() => {
  resetAllMocks()
})

afterEach(() => {
  jest.clearAllTimers()
})

expect.extend({
  toHaveTextContent(received: { props?: { children?: unknown } }, expected: string | RegExp) {
    const content = String(received?.props?.children ?? "")
    const pass = typeof expected === "string" ? content.includes(expected) : expected.test(content)
    return {
      pass,
      message: () => `expected text content ${String(expected)}, received ${content}`,
    }
  },
})
