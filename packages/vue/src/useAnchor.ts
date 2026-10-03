import { ref, watch, onScopeDispose, isRef } from "vue"
import type { Ref } from "vue"
import { toStellarError } from "@use-stellar/core"
import type { AnchorInfo, StellarError } from "@use-stellar/core"

// Assume fetchAnchorInfo is exported from core as per vue-17
// @ts-expect-error -- "@use-stellar/core" is not resolvable from this package yet (Vue WIP)
import { fetchAnchorInfo } from "@use-stellar/core"

export interface UseAnchorOptions {
  domain: string | Ref<string> | (() => string)
  autoFetch?: boolean
}

export interface UseAnchorReturn {
  anchor: Ref<AnchorInfo | null>
  loading: Ref<boolean>
  error: Ref<StellarError | null>
  refetch: () => Promise<void>
}

export function useAnchor(options: UseAnchorOptions): UseAnchorReturn {
  const anchor = ref<AnchorInfo | null>(null)
  const loading = ref(false)
  const error = ref<StellarError | null>(null)
  let abortController: AbortController | null = null

  const getDomain = () => {
    if (typeof options.domain === "function") {
      return (options.domain as () => string)()
    }
    return isRef(options.domain) ? options.domain.value : options.domain
  }

  const refetch = async () => {
    const domainValue = getDomain()
    if (!domainValue) return

    if (abortController) {
      abortController.abort()
    }
    abortController = new AbortController()
    const { signal } = abortController

    loading.value = true
    error.value = null

    try {
      const result = await fetchAnchorInfo({ domain: domainValue, signal })
      if (!signal.aborted) {
        anchor.value = result
      }
    } catch (err) {
      if (!signal.aborted) {
        error.value = toStellarError(err)
      }
    } finally {
      if (!signal.aborted) {
        loading.value = false
      }
    }
  }

  if (options.autoFetch !== false) {
    watch(
      () => getDomain(),
      () => {
        refetch()
      },
      { immediate: true }
    )
  }

  onScopeDispose(() => {
    if (abortController) {
      abortController.abort()
    }
  })

  return { anchor, loading, error, refetch }
}
