/** One cancellable budget shared by every asynchronous phase of an image call. */
export interface ImageDeadline {
  readonly signal: AbortSignal
  check(): void
  run<T>(work: () => T | PromiseLike<T>): Promise<T>
  dispose(): void
}

/**
 * Factories run only after the cancellation listener is installed. The race
 * bounds even a dependency that ignores signal; both late outcomes are consumed.
 * It cannot physically stop such a dependency or preempt synchronous work.
 */
export function createImageDeadline(
  timeoutMs: number,
  caller: AbortSignal | undefined,
  errorFor: (kind: 'aborted' | 'timeout') => Error,
): ImageDeadline {
  const controller = new AbortController()
  const expiresAt = Date.now() + timeoutMs
  let timer: ReturnType<typeof setTimeout> | undefined
  const forwardAbort = (): void => { controller.abort(caller?.reason) }
  const cleanup = (): void => {
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
    caller?.removeEventListener('abort', forwardAbort)
  }
  controller.signal.addEventListener('abort', cleanup, { once: true })
  if (caller?.aborted === true) forwardAbort()
  else {
    caller?.addEventListener('abort', forwardAbort, { once: true })
    timer = setTimeout(() => controller.abort(new DOMException('Image deadline exceeded', 'TimeoutError')), timeoutMs)
  }

  const check = (): void => {
    if (caller?.aborted === true) forwardAbort()
    // Also detect an expired budget after synchronous decoding/filesystem work,
    // before the event loop has had a chance to deliver the timer callback.
    if (!controller.signal.aborted && Date.now() >= expiresAt) {
      controller.abort(new DOMException('Image deadline exceeded', 'TimeoutError'))
    }
    if (controller.signal.aborted) throw errorFor(caller?.aborted === true ? 'aborted' : 'timeout')
  }

  return {
    signal: controller.signal,
    check,
    run: <T>(work: () => T | PromiseLike<T>): Promise<T> => new Promise<T>((resolve, reject) => {
      let settled = false
      const finish = (done: () => void): void => {
        if (settled) return
        settled = true
        controller.signal.removeEventListener('abort', onAbort)
        done()
      }
      const onAbort = (): void => {
        try { check() } catch (error) { finish(() => reject(error)) }
      }
      try {
        check()
        controller.signal.addEventListener('abort', onAbort, { once: true })
        check()
        Promise.resolve(work()).then(value => {
          try {
            check()
            finish(() => resolve(value))
          } catch (error) { finish(() => reject(error)) }
        }, error => {
          try { check() } catch (cancelled) { error = cancelled }
          finish(() => reject(error))
        })
      } catch (error) { finish(() => reject(error)) }
    }),
    dispose: () => {
      cleanup()
      controller.signal.removeEventListener('abort', cleanup)
    },
  }
}
