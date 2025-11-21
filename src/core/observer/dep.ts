import config from '../config'
import { DebuggerOptions, DebuggerEventExtraInfo } from 'v3'

let uid = 0

//待清理的dep队列(subs里会出现null，需要延迟清理)
const pendingCleanupDeps: Dep[] = []

//清理所有dep.subs中为null的订阅者
export const cleanupDeps = () => {
  for (let i = 0; i < pendingCleanupDeps.length; i++) {
    const dep = pendingCleanupDeps[i]
    dep.subs = dep.subs.filter(s => s)
    dep._pending = false
  }
  pendingCleanupDeps.length = 0
}

/**
 * @internal
 */
/**
 * 一个 watcher（观察者）需要实现的接口
 * DepTarget 就是 Watcher
 */
export interface DepTarget extends DebuggerOptions {
  id: number
  addDep(dep: Dep): void
  update(): void
}

/**
 * Dep：依赖管理器，用来收集依赖 & 派发更新
 * @internal
 */
export default class Dep {
  //当前的全局watcher(依赖收集时使用)
  static target?: DepTarget | null
  id: number
  subs: Array<DepTarget | null> //订阅该属性的所有watcher
  _pending = false  //是否已加入清理队列

  constructor() {
    this.id = uid++
    this.subs = []  //初始没有任何watcher订阅它
  }
  //添加一个watcher订阅者
  addSub(sub: DepTarget) {
    this.subs.push(sub)
  }
  //移除watcher
  removeSub(sub: DepTarget) {
    // 这里不直接 splice，因为大量订阅者 splice 会非常慢
    // 所以用 "标记 null" 方式，之后统一清理
    this.subs[this.subs.indexOf(sub)] = null
    if (!this._pending) {
      this._pending = true
      pendingCleanupDeps.push(this)
    }
  }
  //depend依赖收集 在getter中调用
  depend(info?: DebuggerEventExtraInfo) {
    if (Dep.target) {   //有正在计算的wacther才进行依赖收集
      Dep.target.addDep(this)  //watcher记录它依赖dep
      if (__DEV__ && info && Dep.target.onTrack) {
        //devtools调式用
        Dep.target.onTrack({
          effect: Dep.target,
          ...info
        })
      }
    }
  }
  //派发更新，在setter中调用
  notify(info?: DebuggerEventExtraInfo) {
    // 复制一份有效的 subs（过滤掉 null）
    const subs = this.subs.filter(s => s) as DepTarget[]
    // 若不是异步更新，需要排序保证更新顺序一致
    if (__DEV__ && !config.async) {
      // subs aren't sorted in scheduler if not running async
      // we need to sort them now to make sure they fire in correct
      // order
      subs.sort((a, b) => a.id - b.id)
    }
    // 遍历所有 watcher，调用它们的 update()
    for (let i = 0, l = subs.length; i < l; i++) {
      const sub = subs[i]
      if (__DEV__ && info) {
        sub.onTrigger &&
          sub.onTrigger({
            effect: subs[i],
            ...info
          })
      }
      sub.update()  //触发watcher的更新
    }
  }
}

// 当前正在被求值（执行）的目标 watcher。
// 它在全局范围内是唯一的，因为同一时间只能有一个 watcher 被求值。
Dep.target = null

// watcher 调用栈：因为计算属性会嵌套
const targetStack: Array<DepTarget | null | undefined> = []

//进入一个 watcher（如 watcher.run() 之前）
export function pushTarget(target?: DepTarget | null) {
  targetStack.push(target)
  Dep.target = target
}
//离开 watcher（如 watcher.run() 结束）
export function popTarget() {
  targetStack.pop()
  Dep.target = targetStack[targetStack.length - 1]
}
