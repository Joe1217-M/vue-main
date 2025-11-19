import { no, noop, identity } from 'shared/util'

import { LIFECYCLE_HOOKS } from 'shared/constants'
import type { Component } from 'types/component'

/**
 * @internal
 */
export interface Config {
  // user
  optionMergeStrategies: { [key: string]: Function }
  silent: boolean
  productionTip: boolean
  performance: boolean
  devtools: boolean
  errorHandler?: (err: Error, vm: Component | null, info: string) => void
  warnHandler?: (msg: string, vm: Component | null, trace: string) => void
  ignoredElements: Array<string | RegExp>
  keyCodes: { [key: string]: number | Array<number> }

  // platform
  isReservedTag: (x: string) => boolean | undefined
  isReservedAttr: (x: string) => true | undefined
  parsePlatformTagName: (x: string) => string
  isUnknownElement: (x: string) => boolean
  getTagNamespace: (x: string) => string | undefined
  mustUseProp: (tag: string, type?: string | null, name?: string) => boolean

  // private
  async: boolean

  // legacy
  _lifecycleHooks: Array<string>
}

export default {
  /**
   * 选项合并策略 (used in core/util/options)
   */
  // $flow-disable-line
  optionMergeStrategies: Object.create(null),

  /**
   * 是否压制警告
   */
  silent: false,

  /**
   * 启动时显示生产模式提示信息？
   */
  productionTip: __DEV__,

  /**
   * 是否启用开发者工具
   */
  devtools: __DEV__,

  /**
   * 是否记录性能
   */
  performance: false,

  /**
   * 监视器错误的错误处理程序
   */
  errorHandler: null,

  /**
   * 观察者警告的处理程序
   */
  warnHandler: null,

  /**
   * 忽略某些自定义元素
   */
  ignoredElements: [],

  /**
   * v-on 的自定义用户密钥别名
   */
  // $flow-disable-line
  keyCodes: Object.create(null),

  /**
   检查标签是否已被保留，从而无法将其注册为组件。此设置取决于平台，并且可能会被覆盖
   */
  isReservedTag: no,

  /**
   * 检查属性是否为保留属性，使其不能用作组件属性。此设置取决于平台，并且可能被覆盖
   */
  isReservedAttr: no,

  /**
   *检查标签是否为未知元素。
   * Platform-dependent.
   */
  isUnknownElement: no,

  /**
   * 获取元素的命名空间
   */
  getTagNamespace: noop,

  /**
   * 解析特定平台上的真实标签名称
   */
  parsePlatformTagName: identity,

  /**
   * 检查属性是否必须使用属性值进行绑定
   * Platform-dependent.
   */
  mustUseProp: no,

  /**
   * 异步执行更新。此设置旨在供 Vue 测试工具使用。如果设置为 false，将显著降低性能。
   */
  async: true,

  /**
   * 因历史原因而公开
   */
  _lifecycleHooks: LIFECYCLE_HOOKS
} as unknown as Config
