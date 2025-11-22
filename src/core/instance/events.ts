import type { Component } from 'types/component'
import {
  tip,
  toArray,
  isArray,
  hyphenate,
  formatComponentName,
  invokeWithErrorHandling
} from '../util/index'
import { updateListeners } from '../vdom/helpers/index'

export function initEvents(vm: Component) {
  vm._events = Object.create(null)
  vm._hasHookEvent = false
  // init parent attached events
  const listeners = vm.$options._parentListeners
  if (listeners) {
    updateComponentListeners(vm, listeners)
  }
}

let target: any

function add(event, fn) {
  target.$on(event, fn)
}

function remove(event, fn) {
  target.$off(event, fn)
}

function createOnceHandler(event, fn) {
  const _target = target
  return function onceHandler() {
    const res = fn.apply(null, arguments)
    if (res !== null) {
      _target.$off(event, onceHandler)
    }
  }
}

export function updateComponentListeners(
  vm: Component,
  listeners: Object,
  oldListeners?: Object | null
) {
  target = vm
  updateListeners(
    listeners,
    oldListeners || {},
    add,
    remove,
    createOnceHandler,
    vm
  )
  target = undefined
}

export function eventsMixin(Vue: typeof Component) {
  // 用于匹配生命周期事件，例如 "hook:mounted"
  const hookRE = /^hook:/

  /**
   * vm.$on(event, fn)
   * 绑定事件监听器
   * event：事件名称或事件名称数组
   * fn：回调函数
   */
  Vue.prototype.$on = function (
    event: string | Array<string>,
    fn: Function
  ): Component {
    const vm: Component = this

    // 如果 event 是数组，递归对每个事件注册
    if (isArray(event)) {
      for (let i = 0, l = event.length; i < l; i++) {
        vm.$on(event[i], fn)
      }
    } else {
      // 如果该事件不存在，则初始化为空数组
      ;(vm._events[event] || (vm._events[event] = [])).push(fn)

      // hook:event 优化处理，例如 hook:mounted
      // 注册事件时标记 _hasHookEvent，减少后续运行成本
      if (hookRE.test(event)) {
        vm._hasHookEvent = true
      }
    }
    return vm
  }

  /**
   * vm.$once(event, fn)
   * 只触发一次的事件监听器
   */
  Vue.prototype.$once = function (event: string, fn: Function): Component {
    const vm: Component = this

    // 包装一个 on 函数，触发一次后自动解绑
    function on() {
      vm.$off(event, on)
      fn.apply(vm, arguments)
    }
    // 用于在 $off 中识别 fn（on.fn === 原始 fn）
    on.fn = fn

    vm.$on(event, on)
    return vm
  }

  /**
   * vm.$off(event?, fn?)
   * 移除事件监听器
   */
  Vue.prototype.$off = function (
    event?: string | Array<string>,
    fn?: Function
  ): Component {
    const vm: Component = this

    // 1. 如果没有参数，移除所有事件监听器
    if (!arguments.length) {
      vm._events = Object.create(null)
      return vm
    }

    // 2. event 是数组 => 递归处理
    if (isArray(event)) {
      for (let i = 0, l = event.length; i < l; i++) {
        vm.$off(event[i], fn)
      }
      return vm
    }

    // 3. 移除某一个事件的所有监听器
    const cbs = vm._events[event!]
    if (!cbs) {
      return vm
    }
    if (!fn) {
      vm._events[event!] = null
      return vm
    }

    // 4. 移除具体的某个 handler
    let cb
    let i = cbs.length
    while (i--) {
      cb = cbs[i]
      // 若 handler === fn 或 handler.fn === fn，则移除
      if (cb === fn || cb.fn === fn) {
        cbs.splice(i, 1)
        break
      }
    }
    return vm
  }

  /**
   * vm.$emit(event, ...args)
   * 触发事件
   */
  Vue.prototype.$emit = function (event: string): Component {
    const vm: Component = this

    // 在开发环境中警告大小写不一致问题
    if (__DEV__) {
      const lowerCaseEvent = event.toLowerCase()
      if (lowerCaseEvent !== event && vm._events[lowerCaseEvent]) {
        tip(
          `Event "${lowerCaseEvent}" is emitted in component ` +
            `${formatComponentName(vm)} but the handler is registered for "${event}". ` +
            `Note that HTML attributes are case-insensitive and you cannot use ` +
            `v-on to listen to camelCase events when using in-DOM templates. ` +
            `You should probably use "${hyphenate(event)}" instead of "${event}".`
        )
      }
    }

    // 获取事件对应的所有回调
    let cbs = vm._events[event]
    if (cbs) {
      // 如果有多个回调，则复制数组以避免遍历时被修改
      cbs = cbs.length > 1 ? toArray(cbs) : cbs

      // 从 arguments 中取出除事件名外的所有参数
      const args = toArray(arguments, 1)
      const info = `event handler for "${event}"`

      // 依次执行所有回调
      for (let i = 0, l = cbs.length; i < l; i++) {
        invokeWithErrorHandling(cbs[i], vm, args, vm, info)
      }
    }
    return vm
  }
}

