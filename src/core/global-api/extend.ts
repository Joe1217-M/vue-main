import { ASSET_TYPES } from 'shared/constants'
import type { Component } from 'types/component'
import type { GlobalAPI } from 'types/global-api'
import { defineComputed, proxy } from '../instance/state'
import { extend, mergeOptions, validateComponentName } from '../util/index'
import { getComponentName } from '../vdom/create-component'

export function initExtend(Vue: GlobalAPI) {
  /**
   * Vue.cid 是 Vue 构造函数的唯一标识符（Component ID）。
   * 每次通过 Vue.extend 创建的子类构造函数都会生成唯一 cid。
   * 这样可以缓存构造函数，避免重复创建。
   */
  Vue.cid = 0
  let cid = 1

  /**
   * Vue.extend 用于创建“子类组件构造函数”，实现组件继承。
   * extendOptions 是子类组件的配置对象。
   */
  Vue.extend = function (extendOptions: any): typeof Component {
    extendOptions = extendOptions || {}  // 默认空对象
    const Super = this                  // 当前构造函数（可能是 Vue 或其他子类）
    const SuperId = Super.cid

    // 子类构造函数缓存，避免重复创建相同配置的构造函数
    const cachedCtors = extendOptions._Ctor || (extendOptions._Ctor = {})
    if (cachedCtors[SuperId]) {
      return cachedCtors[SuperId]
    }

    // 获取组件名（name 属性）
    const name =
      getComponentName(extendOptions) || getComponentName(Super.options)
    if (__DEV__ && name) {
      validateComponentName(name)  // 开发环境校验组件名是否合法
    }

    /**
     * 创建子类构造函数 Sub
     * 这个构造函数内部调用 this._init(options) 初始化组件实例
     */
    const Sub = function VueComponent(this: any, options: any) {
      this._init(options)
    } as unknown as typeof Component

    // 原型继承 Super，保证 Sub 可以访问父类原型上的方法
    Sub.prototype = Object.create(Super.prototype)
    Sub.prototype.constructor = Sub

    // 子类的唯一 cid
    Sub.cid = cid++

    // 合并父类选项与子类选项，生成最终子类 options
    Sub.options = mergeOptions(Super.options, extendOptions)
    // 保存父类引用，方便访问父类选项
    Sub['super'] = Super

    /**
     * 对 props 和 computed 做优化处理
     * 在扩展时在原型上定义 getter，而不是每个实例重复 defineProperty
     */
    if (Sub.options.props) {
      initProps(Sub)
    }
    if (Sub.options.computed) {
      initComputed(Sub)
    }

    // 继承父类的扩展能力
    Sub.extend = Super.extend
    Sub.mixin = Super.mixin
    Sub.use = Super.use

    // 给子类创建自己的资源注册方法（components / directives / filters）
    ASSET_TYPES.forEach(function (type) {
      Sub[type] = Super[type]
    })

    // 支持递归组件自我引用
    if (name) {
      Sub.options.components[name] = Sub
    }

    /**
     * 保存父类选项快照、子类扩展选项和封闭选项
     * 用于后续实例化时对比和检查父类选项是否有更新
     */
    Sub.superOptions = Super.options
    Sub.extendOptions = extendOptions
    Sub.sealedOptions = extend({}, Sub.options)

    // 缓存子类构造函数，避免重复创建
    cachedCtors[SuperId] = Sub

    return Sub
  }
}


function initProps(Comp: typeof Component) {
  const props = Comp.options.props
  for (const key in props) {
    proxy(Comp.prototype, `_props`, key)
  }
}

function initComputed(Comp: typeof Component) {
  const computed = Comp.options.computed
  for (const key in computed) {
    defineComputed(Comp.prototype, key, computed[key])
  }
}
