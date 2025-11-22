import config from '../config'
import { initUse } from './use'
import { initMixin } from './mixin'
import { initExtend } from './extend'
import { initAssetRegisters } from './assets'
import { set, del } from '../observer/index'
import { ASSET_TYPES } from 'shared/constants'
import builtInComponents from '../components/index'
import { observe } from 'core/observer/index'

import {
  warn,
  extend,
  nextTick,
  mergeOptions,
  defineReactive
} from '../util/index'
import type { GlobalAPI } from 'types/global-api'

export function initGlobalAPI(Vue: GlobalAPI) {
  // ============================
  // 1. 定义 Vue.config 全局配置
  // ============================

  // 创建一个空对象，用于设置 Vue.config 的 getter/setter
  const configDef: Record<string, any> = {}

  // 读取 Vue.config 时返回 config 对象
  configDef.get = () => config

  // 开发环境下禁止直接替换 Vue.config
  if (__DEV__) {
    configDef.set = () => {
      warn(
        'Do not replace the Vue.config object, set individual fields instead.'
      )
    }
  }

  // 把 Vue.config 定义到 Vue 构造函数上
  Object.defineProperty(Vue, 'config', configDef)

  // ============================
  // 2. 暴露 Vue.util —— 内部工具集合
  // ============================
  // ⚠️注意：它不是公开 API，官方不保证兼容
  Vue.util = {
    warn,
    extend,
    mergeOptions,
    defineReactive
  }

  // ============================
  // 3. 定义全局 API：Vue.set / Vue.delete / Vue.nextTick
  // 这些都是响应式系统的入口方法
  // ============================

  Vue.set = set
  Vue.delete = del
  Vue.nextTick = nextTick

  // ============================
  // 4. Vue.observable —— 显式让对象变成响应式的 API（2.6 加入）
  // ============================
  Vue.observable = <T>(obj: T): T => {
    observe(obj)   // 调用响应式入口，让 obj 成为可观察对象
    return obj
  }

  // ============================
  // 5. 初始化 Vue.options —— 存放全局的 components、directives、filters
  // ============================

  // 创建一个空对象作为 Vue.options
  Vue.options = Object.create(null)

  // ASSET_TYPES = ['component', 'directive', 'filter']
  // 为每种类型创建一个空对象存储
  ASSET_TYPES.forEach(type => {
    Vue.options[type + 's'] = Object.create(null)
  })

  // 用于标记全局基础构造器，用于 extend 机制
  Vue.options._base = Vue

  // 把内置组件（如 KeepAlive）混入全局组件
  extend(Vue.options.components, builtInComponents)

  // ============================
  // 6. 初始化全局方法：Vue.use / Vue.mixin / Vue.extend / Vue.component等
  // ============================

  // 定义 Vue.use：安装插件
  initUse(Vue)

  // 定义 Vue.mixin：全局混入
  initMixin(Vue)

  // 定义 Vue.extend：创建子类（继承）
  initExtend(Vue)

  // 定义 Vue.component / Vue.directive / Vue.filter
  initAssetRegisters(Vue)
}
