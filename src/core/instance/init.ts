import config from '../config'
import { initProxy } from './proxy'
import { initState } from './state'
import { initRender } from './render'
import { initEvents } from './events'
import { mark, measure } from '../util/perf'
import { initLifecycle, callHook } from './lifecycle'
import { initProvide, initInjections } from './inject'
import { extend, mergeOptions, formatComponentName } from '../util/index'
import type { Component } from 'types/component'
import type { InternalComponentOptions } from 'types/options'
import { EffectScope } from 'v3/reactivity/effectScope'

let uid = 0

export function initMixin(Vue: typeof Component) {
  // 给 Vue 构造函数挂载 _init 方法
  Vue.prototype._init = function (options?: Record<string, any>) {
    const vm: Component = this

    // 为每个 Vue 实例生成一个唯一 ID
    vm._uid = uid++

    let startTag, endTag
    /* istanbul ignore if */
    // 开发环境下，如果开启性能检测，则打性能标记
    if (__DEV__ && config.performance && mark) {
      startTag = `vue-perf-start:${vm._uid}`  // 起始标记
      endTag = `vue-perf-end:${vm._uid}`      // 结束标记
      mark(startTag)                          // performance.mark(startTag)
    }

    // 标记这是一个 Vue 实例，避免使用 instanceof 检测
    vm._isVue = true

    // 避免这个实例被 Vue 的响应式系统观察
    vm.__v_skip = true

    // 创建 effect scope（响应式副作用作用域），用于 Vue 3 的组合式 API
    vm._scope = new EffectScope(true /* detached */)
    // #13134 特殊情况：父组件渲染期间手动创建子组件
    vm._scope.parent = undefined
    vm._scope._vm = true

    // 合并配置选项
    if (options && options._isComponent) {
      // 内部组件优化：动态合并选项较慢，这里做特殊处理
      initInternalComponent(vm, options as any)
    } else {
      // 普通组件或根实例
      vm.$options = mergeOptions(
        resolveConstructorOptions(vm.constructor as any), // 获取构造函数上的全局配置
        options || {},                                    // 用户传入配置
        vm
      )
    }

    /* istanbul ignore else */
    if (__DEV__) {
      // 在开发环境下，初始化代理对象（用于更友好的错误提示）
      initProxy(vm)
    } else {
      // 生产环境直接把 _renderProxy 指向自己
      vm._renderProxy = vm
    }

    // 暴露真实的实例自身
    vm._self = vm

    // 初始化生命周期相关属性（$parent/$root/$children/$refs）
    initLifecycle(vm)

    // 初始化事件系统（$on/$emit）
    initEvents(vm)

    // 初始化渲染相关属性（$slots/$scopedSlots/_c）
    initRender(vm)

    // 调用 beforeCreate 钩子
    callHook(vm, 'beforeCreate', undefined, false /* setContext */)

    // 初始化 inject（依赖注入），在 data/props 之前
    initInjections(vm)

    // 初始化 data、props、computed、watchers
    initState(vm)

    // 初始化 provide，必须在 data/props 后
    initProvide(vm)

    // 调用 created 钩子
    callHook(vm, 'created')

    /* istanbul ignore if */
    // 开发环境性能标记
    if (__DEV__ && config.performance && mark) {
      vm._name = formatComponentName(vm, false) // 获取组件名
      mark(endTag)                               // performance.mark(endTag)
      measure(`vue ${vm._name} init`, startTag, endTag) // performance.measure
    }

    // 如果存在 el，自动挂载
    if (vm.$options.el) {
      vm.$mount(vm.$options.el)
    }
  }
}

export function initInternalComponent(
  vm: Component,
  options: InternalComponentOptions
) {
  const opts = (vm.$options = Object.create((vm.constructor as any).options))
  // doing this because it's faster than dynamic enumeration.
  const parentVnode = options._parentVnode
  opts.parent = options.parent
  opts._parentVnode = parentVnode

  const vnodeComponentOptions = parentVnode.componentOptions!
  opts.propsData = vnodeComponentOptions.propsData
  opts._parentListeners = vnodeComponentOptions.listeners
  opts._renderChildren = vnodeComponentOptions.children
  opts._componentTag = vnodeComponentOptions.tag

  if (options.render) {
    opts.render = options.render
    opts.staticRenderFns = options.staticRenderFns
  }
}

export function resolveConstructorOptions(Ctor: typeof Component) {
  let options = Ctor.options
  if (Ctor.super) {
    const superOptions = resolveConstructorOptions(Ctor.super)
    const cachedSuperOptions = Ctor.superOptions
    if (superOptions !== cachedSuperOptions) {
      // super option changed,
      // need to resolve new options.
      Ctor.superOptions = superOptions
      // check if there are any late-modified/attached options (#4976)
      const modifiedOptions = resolveModifiedOptions(Ctor)
      // update base extend options
      if (modifiedOptions) {
        extend(Ctor.extendOptions, modifiedOptions)
      }
      options = Ctor.options = mergeOptions(superOptions, Ctor.extendOptions)
      if (options.name) {
        options.components[options.name] = Ctor
      }
    }
  }
  return options
}

function resolveModifiedOptions(
  Ctor: typeof Component
): Record<string, any> | null {
  let modified
  const latest = Ctor.options
  const sealed = Ctor.sealedOptions
  for (const key in latest) {
    if (latest[key] !== sealed[key]) {
      if (!modified) modified = {}
      modified[key] = latest[key]
    }
  }
  return modified
}
