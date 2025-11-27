import VNode from 'core/vdom/vnode'
import { Ref } from 'v3'
import { Component } from './component'
import { ASTModifiers } from './compiler'

/**
 * @internal
 */
export type VNodeChildren =
  | Array<null | VNode | string | number | VNodeChildren>
  | string

/**
 * @internal
 */
export type VNodeComponentOptions = {
  Ctor: typeof Component
  propsData?: Object
  listeners?: Record<string, Function | Function[]>
  children?: Array<VNode>
  tag?: string
}

/**
 * @internal
 */
export type MountedComponentVNode = VNode & {
  context: Component
  componentOptions: VNodeComponentOptions
  componentInstance: Component
  parent: VNode
  data: VNodeData
}

/**
 * @internal
 */
// interface for vnodes in update modules
// VNodeWithData 表示一个“带数据的虚拟节点”，用于 update modules 操作 DOM 或组件
export type VNodeWithData = VNode & {
  tag: string               // 标签名，例如 'div', 'span'；组件节点可能是组件名
  data: VNodeData           // VNode 数据对象，包含 attrs、props、class、style、事件、指令等
  children: Array<VNode>    // 子 VNode 数组
  text: void                // 对于带数据节点通常不是文本节点，所以 text 被置为 void
  elm: any                  // 对应的真实 DOM 元素（patch 后会存在）
  ns: string | void         // 命名空间，如 SVG 的 'svg'
  context: Component        // VNode 所属的 Vue 实例（上下文）
  key: string | number | undefined  // 用于 diff 算法识别节点
  parent?: VNodeWithData    // 可选，父 VNode，便于递归 patch
  componentOptions?: VNodeComponentOptions // 组件节点特有，保存构造器、props、事件等
  componentInstance?: Component         // 如果是组件节点，这里保存子组件实例
  isRootInsert: boolean      // patch 时标记是否是根插入，用于优化 insert 钩子执行
}

// // interface for vnodes in update modules
// export type VNodeWithData = {
//   tag: string;
//   data: VNodeData;
//   children: Array<VNode>;
//   text: void;
//   elm: any;
//   ns: string | void;
//   context: Component;
//   key: string | number | undefined;
//   parent?: VNodeWithData;
//   componentOptions?: VNodeComponentOptions;
//   componentInstance?: Component;
//   isRootInsert: boolean;
// };

/**
 * @internal
 */
export interface VNodeData {
  key?: string | number
  slot?: string
  ref?: string | Ref | ((el: any) => void)
  is?: string
  pre?: boolean
  tag?: string
  staticClass?: string
  class?: any
  staticStyle?: { [key: string]: any }
  style?: string | Array<Object> | Object
  normalizedStyle?: Object
  props?: { [key: string]: any }
  attrs?: { [key: string]: string }
  domProps?: { [key: string]: any }
  hook?: { [key: string]: Function }
  on?: { [key: string]: Function | Array<Function> }
  nativeOn?: { [key: string]: Function | Array<Function> }
  transition?: Object
  show?: boolean // marker for v-show
  inlineTemplate?: {
    render: Function
    staticRenderFns: Array<Function>
  }
  directives?: Array<VNodeDirective>
  keepAlive?: boolean
  scopedSlots?: { [key: string]: Function }
  model?: {
    value: any
    callback: Function
  }

  [key: string]: any
}

/**
 * @internal
 */
export type VNodeDirective = {
  name: string
  rawName: string
  value?: any
  oldValue?: any
  arg?: string
  oldArg?: string
  modifiers?: ASTModifiers
  def?: Object
}

/**
 * @internal
 */
export type ScopedSlotsData = Array<
  { key: string; fn: Function } | ScopedSlotsData
>
