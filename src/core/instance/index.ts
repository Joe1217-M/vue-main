import { initMixin } from './init'
import { stateMixin } from './state'
import { renderMixin } from './render'
import { eventsMixin } from './events'
import { lifecycleMixin } from './lifecycle'
import { warn } from '../util/index'
import type { GlobalAPI } from 'types/global-api'

// Vue 构造函数（核心入口）
function Vue(options) {
  
  // 开发环境下，防止用户不使用 new 调用 Vue
  if (__DEV__ && !(this instanceof Vue)) {
    warn('Vue is a constructor and should be called with the `new` keyword')
  }

  // 调用实例初始化方法，初始化生命周期、事件、状态、渲染等
  this._init(options)
}

// 向 Vue.prototype 添加 _init 方法（新建实例的初始化逻辑）
//@ts-expect-error Vue has function type
initMixin(Vue)

// 添加 $set / $delete / $watch 等与状态相关方法
//@ts-expect-error Vue has function type
stateMixin(Vue)

// 添加事件系统相关：$on / $once / $off / $emit
//@ts-expect-error Vue has function type
eventsMixin(Vue)

// 添加生命周期方法，如 _update / $destroy / $forceUpdate
//@ts-expect-error Vue has function type
lifecycleMixin(Vue)

// 添加渲染相关方法：_render / $nextTick
//@ts-expect-error Vue has function type
renderMixin(Vue)

// 将增强后的 Vue 导出，并断言成 GlobalAPI 类型（包含静态 API）
export default Vue as unknown as GlobalAPI
