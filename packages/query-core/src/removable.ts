import { isServer, isValidTimeout } from './utils'
// 抽象类，它的子类都有一个gcTime属性，这个属性是一个number类型的值，表示多久之后会被回收
// destroy方法，这个方法会清除gcTimeout
// scheduleGc方法，这个方法会清除gcTimeout，然后根据gcTime设置一个gcTimeout
// updateGcTime方法，这个方法会更新gcTime
// clearGcTimeout方法，这个方法会清除gcTimeout
// optionalRemove方法，这个方法是一个抽象方法，它会在gcTimeout之后被调用
export abstract class Removable {
  gcTime!: number
  #gcTimeout?: ReturnType<typeof setTimeout>

  destroy(): void {
    this.clearGcTimeout()
  }

  protected scheduleGc(): void {
    this.clearGcTimeout()

    if (isValidTimeout(this.gcTime)) {
      this.#gcTimeout = setTimeout(() => {
        this.optionalRemove()
      }, this.gcTime)
    }
  }

  protected updateGcTime(newGcTime: number | undefined): void {
    // Default to 5 minutes (Infinity for server-side) if no gcTime is set
    this.gcTime = Math.max(
      this.gcTime || 0,
      newGcTime ?? (isServer ? Infinity : 5 * 60 * 1000),
    )
  }

  protected clearGcTimeout() {
    if (this.#gcTimeout) {
      clearTimeout(this.#gcTimeout)
      this.#gcTimeout = undefined
    }
  }

  protected abstract optionalRemove(): void
}
