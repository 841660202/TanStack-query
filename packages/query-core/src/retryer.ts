import { focusManager } from './focusManager'
import { onlineManager } from './onlineManager'
import { isServer, sleep } from './utils'
import type { CancelOptions, DefaultError, NetworkMode } from './types'

// TYPES

interface RetryerConfig<TData = unknown, TError = DefaultError> {
  fn: () => TData | Promise<TData>
  abort?: () => void
  onError?: (error: TError) => void
  onSuccess?: (data: TData) => void
  onFail?: (failureCount: number, error: TError) => void
  onPause?: () => void
  onContinue?: () => void
  retry?: RetryValue<TError>
  retryDelay?: RetryDelayValue<TError>
  networkMode: NetworkMode | undefined
}

export interface Retryer<TData = unknown> {
  promise: Promise<TData>
  cancel: (cancelOptions?: CancelOptions) => void
  continue: () => Promise<unknown>
  cancelRetry: () => void
  continueRetry: () => void
}

export type RetryValue<TError> = boolean | number | ShouldRetryFunction<TError>

type ShouldRetryFunction<TError = DefaultError> = (
  failureCount: number,
  error: TError,
) => boolean

export type RetryDelayValue<TError> = number | RetryDelayFunction<TError>

type RetryDelayFunction<TError = DefaultError> = (
  failureCount: number,
  error: TError,
) => number

function defaultRetryDelay(failureCount: number) {
  return Math.min(1000 * 2 ** failureCount, 30000)
}

export function canFetch(networkMode: NetworkMode | undefined): boolean {
  return (networkMode ?? 'online') === 'online'
    ? onlineManager.isOnline()
    : true
}

export class CancelledError {
  revert?: boolean
  silent?: boolean
  constructor(options?: CancelOptions) {
    this.revert = options?.revert
    this.silent = options?.silent
  }
}

export function isCancelledError(value: any): value is CancelledError {
  return value instanceof CancelledError
}

export function createRetryer<TData = unknown, TError = DefaultError>(
  config: RetryerConfig<TData, TError>,
): Retryer<TData> {
  // 是否取消重试
  let isRetryCancelled = false
  // 失败次数
  let failureCount = 0
  // 是否已解决
  let isResolved = false
  let continueFn: ((value?: unknown) => boolean) | undefined
  let promiseResolve: (data: TData) => void
  let promiseReject: (error: TError) => void
  // Promise：函数创建了一个新的 Promise 对象，该对象的 resolve 和 reject 方法被赋予内部变量 promiseResolve 和 promiseReject，以便在适当的时机解决或拒绝这个 Promise
  // 这里有点奇怪，这个Promise 对象 的resolve 和 reject在之外的地方被调用了，这种写法也被允许？（见本文件底部）

  const promise = new Promise<TData>((outerResolve, outerReject) => {
    promiseResolve = outerResolve
    promiseReject = outerReject
  })
  // cancel 方法允许外部取消重试操作，并调用 config.abort 方法（如果提供）来执行任何必要的清理
  const cancel = (cancelOptions?: CancelOptions): void => {
    if (!isResolved) {
      reject(new CancelledError(cancelOptions))

      config.abort?.()
    }
  }
  const cancelRetry = () => {
    isRetryCancelled = true
  }

  const continueRetry = () => {
    isRetryCancelled = false
  }

  const shouldPause = () =>
    !focusManager.isFocused() ||
    (config.networkMode !== 'always' && !onlineManager.isOnline())

  const resolve = (value: any) => {
    if (!isResolved) {
      isResolved = true
      config.onSuccess?.(value)
      continueFn?.()
      promiseResolve(value)
    }
  }

  const reject = (value: any) => {
    if (!isResolved) {
      isResolved = true
      config.onError?.(value)
      continueFn?.()
      promiseReject(value)
    }
  }
  // pause 方法返回一个 Promise，它在 shouldPause 返回 true 时暂停执行。continueRetry 和 cancelRetry 方法控制是否应该继续或取消重试
  const pause = () => {
    return new Promise((continueResolve) => {
      continueFn = (value) => {
        const canContinue = isResolved || !shouldPause()
        if (canContinue) {
          continueResolve(value)
        }
        return canContinue
      }
      config.onPause?.()
    }).then(() => {
      continueFn = undefined
      if (!isResolved) {
        config.onContinue?.()
      }
    })
  }

  // Create loop function
  // run 方法包含执行重试的主要逻辑。它调用 config.fn 函数（应该是执行异步操作的函数），并根据配置的重试策略来处理成功或失败的结果
  const run = () => {
    // Do nothing if already resolved
    if (isResolved) {
      return
    }

    let promiseOrValue: any

    // Execute query
    try {
      promiseOrValue = config.fn()
    } catch (error) {
      promiseOrValue = Promise.reject(error)
    }

    Promise.resolve(promiseOrValue)
      .then(resolve)
      .catch((error) => {
        // Stop if the fetch is already resolved
        if (isResolved) {
          return
        }

        // Do we need to retry the request?
        const retry = config.retry ?? (isServer ? 0 : 3)
        const retryDelay = config.retryDelay ?? defaultRetryDelay
        const delay =
          typeof retryDelay === 'function'
            ? retryDelay(failureCount, error)
            : retryDelay
        const shouldRetry =
          retry === true ||
          (typeof retry === 'number' && failureCount < retry) ||
          (typeof retry === 'function' && retry(failureCount, error))

        if (isRetryCancelled || !shouldRetry) {
          // We are done if the query does not need to be retried
          reject(error)
          return
        }

        failureCount++

        // Notify on fail
        config.onFail?.(failureCount, error)

        // Delay
        sleep(delay) // 重试延迟
          // Pause if the document is not visible or when the device is offline
          .then(() => {
            if (shouldPause()) {
              return pause()
            }
            return
          })
          .then(() => {
            if (isRetryCancelled) {
              reject(error)
            } else {
              run() // 继续执行重试
            }
          })
      })
  }

  // Start loop
  if (canFetch(config.networkMode)) {
    run()
  } else {
    pause().then(run)
  }

  return {
    promise,
    cancel,
    continue: () => {
      const didContinue = continueFn?.()
      return didContinue ? promise : Promise.resolve()
    },
    cancelRetry,
    continueRetry,
  }
}
// 在 JavaScript 中，`Promise` 构造函数接受一个执行器函数（executor function）作为参数，这个函数本身接受两个参数：`resolve` 和 `reject` 函数。这些函数用于在异步操作完成时解决或拒绝 `Promise`。

// 在你提到的代码中，`promiseResolve` 和 `promiseReject` 是在 `Promise` 构造函数外部定义的变量，它们在 `Promise` 的执行器函数内部被赋值。
// 这是一种特殊的模式，通常被称为 "deferred"，它允许你在 `Promise` 的外部控制这个 `Promise` 的解决（resolve）或拒绝（reject）状态。

// 这里是如何做到的：

// ```javascript
// let promiseResolve: (data: TData) => void;
// let promiseReject: (error: TError) => void;

// const promise = new Promise<TData>((outerResolve, outerReject) => {
//   promiseResolve = outerResolve;
//   promiseReject = outerReject;
// });
// ```

// 在这段代码中，`promiseResolve` 和 `promiseReject` 被定义为变量，并在 `Promise` 的执行器函数内被赋值为 `resolve` 和 `reject` 函数。这样，即使在 `Promise` 构造函数的外部，你也可以通过调用 `promiseResolve(value)` 或 `promiseReject(error)` 来解决或拒绝这个 `Promise`。

// 这种模式允许更灵活地处理异步操作，因为你可以在原始 `Promise` 创建的上下文之外解决或拒绝它。然而，这种做法也被认为是一种反模式，因为它打破了 `Promise` 的封装性，并且可能导致难以追踪的状态管理问题。通常，我们应该试图避免在 `Promise` 外部存储 `resolve` 和 `reject` 函数的引用，并且应该在 `Promise` 的执行器函数内部或通过 `.then`、`.catch` 和 `.finally` 方法来处理异步流程。

// 不过，在某些复杂的异步控制流程中，特别是在库的内部实现时，这种模式可能是必要的，因为它提供了对异步操作更细粒度的控制。在这种情况下，使用这种模式的开发者需要格外小心，确保 `resolve` 和 `reject` 函数在合适的时机被调用，并且避免内存泄漏或状态不一致的问题。
