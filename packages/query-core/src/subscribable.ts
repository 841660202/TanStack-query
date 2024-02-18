type Listener = () => void

export class Subscribable<TListener extends Function = Listener> {
  protected listeners: Set<TListener>

  constructor() {
    this.listeners = new Set()
    this.subscribe = this.subscribe.bind(this)
  }

  subscribe(listener: TListener): () => void {
    this.listeners.add(listener)

    this.onSubscribe()

    return () => {
      this.listeners.delete(listener)
      this.onUnsubscribe()
    }
  }

  hasListeners(): boolean {
    return this.listeners.size > 0
  }
  // 在ES6类中，方法重写（也称为方法覆盖）指的是在派生类（子类）中定义一个与基类（父类）中同名的方法。
  // 当派生类的实例调用这个方法时，将执行派生类中定义的版本，
  // 这就实现了对基类方法的重写。
  // 这个方法会被重写
  protected onSubscribe(): void {
    // Do nothing
  }

  protected onUnsubscribe(): void {
    // Do nothing
  }
}
