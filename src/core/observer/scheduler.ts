import type Watcher from './watcher'
import config from '../config'
import Dep, { cleanupDeps } from './dep'
import { callHook, activateChildComponent } from '../instance/lifecycle'

import { warn, nextTick, devtools, inBrowser, isIE } from '../util/index'
import type { Component } from 'types/component'

export const MAX_UPDATE_COUNT = 100

const queue: Array<Watcher> = []
const activatedChildren: Array<Component> = []
let has: { [key: number]: true | undefined | null } = {}
let circular: { [key: number]: number } = {}
let waiting = false
let flushing = false
let index = 0

/**
 * Reset the scheduler's state.
 */
function resetSchedulerState() {
  index = queue.length = activatedChildren.length = 0
  has = {}
  if (__DEV__) {
    circular = {}
  }
  waiting = flushing = false
}

// Async edge case #6566 requires saving the timestamp when event listeners are
// attached. However, calling performance.now() has a perf overhead especially
// if the page has thousands of event listeners. Instead, we take a timestamp
// every time the scheduler flushes and use that for all event listeners
// attached during that flush.
export let currentFlushTimestamp = 0

// Async edge case fix requires storing an event listener's attach timestamp.
let getNow: () => number = Date.now

// Determine what event timestamp the browser is using. Annoyingly, the
// timestamp can either be hi-res (relative to page load) or low-res
// (relative to UNIX epoch), so in order to compare time we have to use the
// same timestamp type when saving the flush timestamp.
// All IE versions use low-res event timestamps, and have problematic clock
// implementations (#9632)
if (inBrowser && !isIE) {
  const performance = window.performance
  if (
    performance &&
    typeof performance.now === 'function' &&
    getNow() > document.createEvent('Event').timeStamp
  ) {
    // if the event timestamp, although evaluated AFTER the Date.now(), is
    // smaller than it, it means the event is using a hi-res timestamp,
    // and we need to use the hi-res version for event listener timestamps as
    // well.
    getNow = () => performance.now()
  }
}

const sortCompareFn = (a: Watcher, b: Watcher): number => {
  if (a.post) {
    if (!b.post) return 1
  } else if (b.post) {
    return -1
  }
  return a.id - b.id
}

/**
 * 执行并清空 watcher 队列
 * 这是 Vue 2 异步更新的真正执行入口
 */
function flushSchedulerQueue() {
  // 记录本次 flush 的时间戳（用于事件时间比较、边界情况）
  currentFlushTimestamp = getNow()

  // 标记当前正在执行 watcher 队列
  flushing = true
  let watcher, id

  // 在执行前先对 watcher 队列排序
  // 排序的目的非常关键：
  // 1. 保证组件按 父 → 子 的顺序更新（父 watcher 创建得早，id 小）
  // 2. 保证 user watcher 先于 render watcher 执行
  // 3. 如果父组件执行过程中销毁了子组件，子组件 watcher 能被跳过
  queue.sort(sortCompareFn)

  // 注意：这里不能缓存 queue.length
  // 因为在 watcher.run() 过程中可能会动态插入新的 watcher
  for (index = 0; index < queue.length; index++) {
    watcher = queue[index]

    // 在 watcher 执行前调用 before 钩子
    // 对应组件的 beforeUpdate 生命周期
    if (watcher.before) {
      watcher.before()
    }

    // 当前 watcher 的唯一 id
    id = watcher.id

    // 在真正执行前清除 has 标记
    // 允许该 watcher 在下一轮更新中再次入队
    has[id] = null

    // 执行 watcher：
    // - render watcher 会触发 patch
    // - user watcher 会执行用户定义的回调
    watcher.run()

    // 开发环境下：检测无限更新循环
    if (__DEV__ && has[id] != null) {
      // 同一个 watcher 在一次 flush 中被反复触发
      circular[id] = (circular[id] || 0) + 1

      // 超过最大更新次数，认为是死循环，直接报警并终止
      if (circular[id] > MAX_UPDATE_COUNT) {
        warn(
          'You may have an infinite update loop ' +
            (watcher.user
              ? `in watcher with expression "${watcher.expression}"`
              : `in a component render function.`),
          watcher.vm
        )
        break
      }
    }
  }

  // 在重置调度器状态之前，拷贝当前队列
  // 因为 resetSchedulerState 会清空原始数据
  const activatedQueue = activatedChildren.slice()
  const updatedQueue = queue.slice()

  // 重置调度器状态：
  // - 清空队列
  // - 重置 index / has / waiting / flushing 等标记
  resetSchedulerState()

  // 调用 keep-alive 组件的 activated 钩子
  callActivatedHooks(activatedQueue)

  // 调用组件的 updated 生命周期钩子
  callUpdatedHooks(updatedQueue)

  // 清理依赖收集过程中产生的无用依赖
  cleanupDeps()

  // 通知 Vue Devtools 本次 flush 已完成
  /* istanbul ignore if */
  if (devtools && config.devtools) {
    devtools.emit('flush')
  }
}

function callUpdatedHooks(queue: Watcher[]) {
  let i = queue.length
  while (i--) {
    const watcher = queue[i]
    const vm = watcher.vm
    if (vm && vm._watcher === watcher && vm._isMounted && !vm._isDestroyed) {
      callHook(vm, 'updated')
    }
  }
}

/**
 * 将一个在 patch（VNode 更新渲染）过程中被激活的 KeepAlive 组件加入激活队列
 * 这些组件会在整棵 VNode 树 patch 完成后，统一执行 activated 钩子。
 */
export function queueActivatedComponent(vm: Component) {
  // 将组件的 _inactive 状态置为 false
  // 表示该组件不再处于“未激活”状态（inactive）
  // 这样 render 函数或 router-view 等内部逻辑可以依赖这个标记判断组件是否活跃
  // 例如：<keep-alive> 内切换 <router-view> 时，判断组件该不该更新
  vm._inactive = false

  // 将该实例推入 activatedChildren 队列
  // 这个队列会在整个 patch 流程结束后调用 flushSchedulerQueue()
  // 在 flushSchedulerQueue 中会统一执行 activated 钩子（vm.$emit("activated")）
  activatedChildren.push(vm)
}

function callActivatedHooks(queue) {
  for (let i = 0; i < queue.length; i++) {
    queue[i]._inactive = true
    activateChildComponent(queue[i], true /* true */)
  }
}

/**
 * 将 watcher 推入 watcher 队列
 * 同一个 watcher（相同 id）在一次更新周期内只会入队一次
 * 但如果是在 flush 过程中新增的 watcher，需要特殊插入
 */
export function queueWatcher(watcher: Watcher) {
  const id = watcher.id

  // 已经入队过的 watcher，直接跳过（去重）
  if (has[id] != null) {
    return
  }

  // 防止 watcher 在执行过程中递归触发自己（如 computed / user watcher）
  if (watcher === Dep.target && watcher.noRecurse) {
    return
  }

  // 标记该 watcher 已入队，用于去重
  has[id] = true

  // 如果当前不在 flush（执行队列）阶段
  if (!flushing) {
    // 直接 push 到队列尾部，等待统一执行
    queue.push(watcher)
  } else {
    // 如果正在 flush：
    // 说明 watcher 是在执行过程中被触发的
    // 需要插入到「还没执行的 watcher」之前，保证执行顺序
    let i = queue.length - 1

    // 从队列尾部向前查找
    // 保证新 watcher 的 id 大于已执行的 watcher
    // 同时小于等于后续未执行的 watcher
    while (i > index && queue[i].id > watcher.id) {
      i--
    }

    // 插入到合适位置，保证 watcher 按 id 递增执行
    queue.splice(i + 1, 0, watcher)
  }

  // 如果还没有安排 flush，则安排一次
  if (!waiting) {
    waiting = true

    // 开发环境下，如果关闭 async，直接同步执行（方便调试）
    if (__DEV__ && !config.async) {
      flushSchedulerQueue()
      return
    }

    // 正常情况：在 nextTick 中异步 flush watcher 队列
    nextTick(flushSchedulerQueue)
  }
}
