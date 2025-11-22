import {
  warn,
  nextTick,
  emptyObject,
  handleError,
  defineReactive,
  isArray
} from '../util/index'

import { createElement } from '../vdom/create-element'
import { installRenderHelpers } from './render-helpers/index'
import { resolveSlots } from './render-helpers/resolve-slots'
import { normalizeScopedSlots } from '../vdom/helpers/normalize-scoped-slots'
import VNode, { createEmptyVNode } from '../vdom/vnode'

import { isUpdatingChildComponent } from './lifecycle'
import type { Component } from 'types/component'
import { currentInstance, setCurrentInstance } from 'v3/currentInstance'
import { syncSetupSlots } from 'v3/apiSetup'

export function initRender(vm: Component) {
  vm._vnode = null // the root of the child tree
  vm._staticTrees = null // v-once cached trees
  const options = vm.$options
  const parentVnode = (vm.$vnode = options._parentVnode!) // the placeholder node in parent tree
  const renderContext = parentVnode && (parentVnode.context as Component)
  vm.$slots = resolveSlots(options._renderChildren, renderContext)
  vm.$scopedSlots = parentVnode
    ? normalizeScopedSlots(
        vm.$parent!,
        parentVnode.data!.scopedSlots,
        vm.$slots
      )
    : emptyObject
  // bind the createElement fn to this instance
  // so that we get proper render context inside it.
  // args order: tag, data, children, normalizationType, alwaysNormalize
  // internal version is used by render functions compiled from templates
  // @ts-expect-error
  vm._c = (a, b, c, d) => createElement(vm, a, b, c, d, false)
  // normalization is always applied for the public version, used in
  // user-written render functions.
  // @ts-expect-error
  vm.$createElement = (a, b, c, d) => createElement(vm, a, b, c, d, true)

  // $attrs & $listeners are exposed for easier HOC creation.
  // they need to be reactive so that HOCs using them are always updated
  const parentData = parentVnode && parentVnode.data

  /* istanbul ignore else */
  if (__DEV__) {
    defineReactive(
      vm,
      '$attrs',
      (parentData && parentData.attrs) || emptyObject,
      () => {
        !isUpdatingChildComponent && warn(`$attrs is readonly.`, vm)
      },
      true
    )
    defineReactive(
      vm,
      '$listeners',
      options._parentListeners || emptyObject,
      () => {
        !isUpdatingChildComponent && warn(`$listeners is readonly.`, vm)
      },
      true
    )
  } else {
    defineReactive(
      vm,
      '$attrs',
      (parentData && parentData.attrs) || emptyObject,
      null,
      true
    )
    defineReactive(
      vm,
      '$listeners',
      options._parentListeners || emptyObject,
      null,
      true
    )
  }
}

export let currentRenderingInstance: Component | null = null

// for testing only
export function setCurrentRenderingInstance(vm: Component) {
  currentRenderingInstance = vm
}

export function renderMixin(Vue: typeof Component) {
  /**
   * 安装运行时渲染辅助函数（比如 _v, _c, _s 等）
   * 这些方法在模板编译后的 render 函数中会被用到。
   */
  installRenderHelpers(Vue.prototype)

  /**
   * $nextTick：
   * 在下次 DOM 更新循环结束后执行回调。
   * - DOM 更新是异步的
   * - 用于在数据变更后等待真实 DOM 更新完成再操作 DOM
   */
  Vue.prototype.$nextTick = function (fn: (...args: any[]) => any) {
    return nextTick(fn, this)
  }

  /**
   * _render：
   * 核心渲染函数。
   * - 由 watcher 调用（如 render watcher）
   * - 返回一个虚拟 DOM（VNode）
   */
  Vue.prototype._render = function (): VNode {
    const vm: Component = this
    const { render, _parentVnode } = vm.$options

    /**
     * 处理作用域插槽：
     * 如果组件被挂载（_isMounted）并且存在父级 vnode
     * 就需要更新 scopedSlots（可能来自父组件）
     */
    if (_parentVnode && vm._isMounted) {
      vm.$scopedSlots = normalizeScopedSlots(
        vm.$parent!,
        _parentVnode.data!.scopedSlots,
        vm.$slots,
        vm.$scopedSlots
      )

      // 如果 setup 中有 slotsProxy，也同步它（Vue 2.7 支持）
      if (vm._slotsProxy) {
        syncSetupSlots(vm._slotsProxy, vm.$scopedSlots)
      }
    }

    // 把父 vnode 记录下来，使 render 函数能访问它
    vm.$vnode = _parentVnode!

    // 保存当前渲染实例
    const prevInst = currentInstance
    const prevRenderInst = currentRenderingInstance
    let vnode

    try {
      // 标记当前组件实例为渲染中的实例
      setCurrentInstance(vm)
      currentRenderingInstance = vm

      /**
       * 调用用户提供的 render 函数
       * render(h) { return h('div', ...) }
       *
       * - this._renderProxy 在 dev 模式下会是代理对象
       * - vm.$createElement 就是 h()
       */
      vnode = render.call(vm._renderProxy, vm.$createElement)
    } catch (e: any) {
      // 捕获 render 错误，以防整个视图渲染失败
      handleError(e, vm, `render`)

      /**
       * 如果有 renderError 函数，则调用它返回 fallback vnode
       * 仅 dev 环境会触发
       */
      if (__DEV__ && vm.$options.renderError) {
        try {
          vnode = vm.$options.renderError.call(
            vm._renderProxy,
            vm.$createElement,
            e
          )
        } catch (e: any) {
          handleError(e, vm, `renderError`)
          vnode = vm._vnode // 使用旧 vnode 防止组件渲染白屏
        }
      } else {
        vnode = vm._vnode
      }
    } finally {
      // 还原之前的渲染上下文
      currentRenderingInstance = prevRenderInst
      setCurrentInstance(prevInst)
    }

    /**
     * 如果 render 返回的是数组（多根节点），
     * 且仅有一个节点 → 自动取第一个作为根
     */
    if (isArray(vnode) && vnode.length === 1) {
      vnode = vnode[0]
    }

    /**
     * 如果 render 返回的不是 VNode（例如返回 null 或 字符串）
     * 则创建一个空的注释节点（防止渲染错误导致崩溃）
     */
    if (!(vnode instanceof VNode)) {
      if (__DEV__ && isArray(vnode)) {
        warn(
          'Multiple root nodes returned from render function. Render function ' +
            'should return a single root node.',
          vm
        )
      }
      vnode = createEmptyVNode()
    }

    // 设置 vnode 的 parent，以便 patch 阶段能正确处理父子关系
    vnode.parent = _parentVnode

    return vnode
  }
}

