import Vue from './instance/index' 
// 引入 Vue 构造函数（原型方法已初始化）

import { initGlobalAPI } from './global-api/index'
// 引入初始化全局静态 API 的方法

import { isServerRendering } from 'core/util/env'
// 判断是否处于 SSR 环境的方法

import { FunctionalRenderContext } from 'core/vdom/create-functional-component'
// 函数式组件渲染上下文对象，用于普通和 SSR 渲染

import { version } from 'v3'
// Vue 版本号

// 初始化 Vue 的静态全局 API，如 Vue.config、Vue.set、Vue.use 等
initGlobalAPI(Vue)

// 在 Vue 实例上添加 $isServer，用于判断是否处于服务端渲染环境
Object.defineProperty(Vue.prototype, '$isServer', {
  get: isServerRendering
})

// 给 Vue 实例添加 $ssrContext，在 SSR 渲染时获取上下文对象
Object.defineProperty(Vue.prototype, '$ssrContext', {
  get() {
    return this.$vnode && this.$vnode.ssrContext
  }
})

// 暴露 FunctionalRenderContext（内部 API）供 SSR 使用
Object.defineProperty(Vue, 'FunctionalRenderContext', {
  value: FunctionalRenderContext
})

// 设置 Vue 的版本号，允许外部访问 Vue.version
Vue.version = version

// 导出最终构造好的 Vue
export default Vue
