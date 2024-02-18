// TYPES

type NotifyCallback = () => void

type NotifyFunction = (callback: () => void) => void

type BatchNotifyFunction = (callback: () => void) => void

type BatchCallsCallback<T extends Array<unknown>> = (...args: T) => void

type ScheduleFunction = (callback: () => void) => void

export function createNotifyManager() {
  let queue: Array<NotifyCallback> = []
  let transactions = 0
  let notifyFn: NotifyFunction = (callback) => {
    callback()
  }
  let batchNotifyFn: BatchNotifyFunction = (callback: () => void) => {
    callback()
  }
  let scheduleFn: ScheduleFunction = (cb) => setTimeout(cb, 0)

  const setScheduler = (fn: ScheduleFunction) => {
    scheduleFn = fn
  }

  const batch = <T>(callback: () => T): T => {
    let result
    transactions++
    try {
      result = callback()
    } finally {
      transactions--
      if (!transactions) {
        flush() // 如果没有正在进行的事务，则执行队列中的通知
      }
    }
    return result
  }

  const schedule = (callback: NotifyCallback): void => {
    if (transactions) {
      queue.push(callback)
    } else {
      scheduleFn(() => {
        notifyFn(callback)
      })
    }
  }

  /**
   * All calls to the wrapped function will be batched.
   * 所有对包装函数的调用都将被批处理。
   */
  const batchCalls = <T extends Array<unknown>>(
    callback: BatchCallsCallback<T>,
  ): BatchCallsCallback<T> => {
    return (...args) => {
      schedule(() => {
        callback(...args)
      })
    }
  }

  const flush = (): void => {
    const originalQueue = queue
    queue = []
    if (originalQueue.length) {
      scheduleFn(() => {
        batchNotifyFn(() => {
          originalQueue.forEach((callback) => {
            notifyFn(callback)
          })
        })
      })
    }
  }

  /**
   * Use this method to set a custom notify function.
   * This can be used to for example wrap notifications with `React.act` while running tests.
   * 使用此方法设置自定义通知函数。
   * 例如，在运行测试时，可以使用它来包装通知以与`React.act`一起使用。
   */
  const setNotifyFunction = (fn: NotifyFunction) => {
    notifyFn = fn
  }

  /**
   * Use this method to set a custom function to batch notifications together into a single tick.
   * By default React Query will use the batch function provided by ReactDOM or React Native.
   * 使用此方法设置自定义函数，将通知一起批处理到单个tick中。
   * 默认情况下，React Query将使用ReactDOM或React Native提供的批处理函数。
   */
  const setBatchNotifyFunction = (fn: BatchNotifyFunction) => {
    batchNotifyFn = fn
  }

  return {
    batch,
    batchCalls,
    schedule,
    setNotifyFunction,
    setBatchNotifyFunction,
    setScheduler,
  } as const
}

// SINGLETON
export const notifyManager = createNotifyManager()

// `createNotifyManager` 是一个工厂函数，它创建并返回一个通知管理器对象，该对象包含一组用于批处理通知、调度通知和设置自定义通知行为的方法。这个管理器用于控制通知的执行顺序，确保它们按预期的方式进行批处理和调度。以下是该代码逻辑的详细解释：

// 1. **变量初始化**:
//    - `queue`: 用于存储待处理的通知回调函数的队列。
//    - `transactions`: 一个计数器，用于跟踪当前正在执行的批处理操作的数量。
//    - `notifyFn`: 一个通知函数，用于立即执行一个回调函数。
//    - `batchNotifyFn`: 一个批处理通知函数，用于立即执行一个回调函数。
//    - `scheduleFn`: 一个调度函数，用于异步延迟执行回调函数。

// 2. **setScheduler**:
//    允许设置一个自定义的调度函数，该函数用于安排通知回调的执行。

// 3. **batch**:
//    一个泛型函数，它接收一个回调函数并执行它。该函数将 `transactions` 计数器增加 1，以表示一个新的批处理事务开始。在回调函数执行后，`transactions` 计数器减 1。如果 `transactions` 计数器为 0，表示所有批处理事务已完成，此时调用 `flush` 函数来处理队列中的通知。

// 4. **schedule**:
//    将通知回调函数添加到队列中或立即使用调度函数来执行。如果当前正在进行批处理事务（`transactions > 0`），则将回调添加到队列中。否则，使用 `scheduleFn` 来异步执行通知函数。

// 5. **batchCalls**:
//    返回一个新的函数，该函数将对原始函数的调用进行批处理。每次调用新函数时，它都会使用 `schedule` 函数来安排原始函数的执行。

// 6. **flush**:
//    执行队列中所有的通知回调。首先，它将当前队列复制到一个新数组中，并清空原队列，以便新的通知可以被加入到一个干净的队列中。然后，如果复制的队列不为空，它将使用 `scheduleFn` 来异步执行 `batchNotifyFn`，该函数会遍历并执行所有复制队列中的通知回调。

// 7. **setNotifyFunction**:
//    允许设置一个自定义的通知函数，用于替换默认的立即执行回调函数。

// 8. **setBatchNotifyFunction**:
//    允许设置一个自定义的批处理通知函数，用于替换默认的批处理通知逻辑。

// 最终，`createNotifyManager` 返回一个包含上述方法的对象。这个管理器可以被用来控制通知的执行，允许它们被批处理或异步调度，以及设置自定义的通知和批处理行为。这是一种常见的模式，特别是在需要确保状态更新不会导致不必要的重渲染或在测试中需要控制通知执行的时机时。在库如 React Query 中，这样的管理器可以用来精细控制查询的重试、缓存更新等异步行为。
