// 引入平台相关的底层 DOM 操作封装（nodeOps）
import * as nodeOps from 'web/runtime/node-ops'
// 引入虚拟 DOM 核心 patch 函数工厂
import { createPatchFunction } from 'core/vdom/patch'
// 引入 VNode 模块的基础功能，比如 attrs、class、style、events
import baseModules from 'core/vdom/modules/index'
// 引入平台特定模块，比如浏览器事件、class、style 等
import platformModules from 'web/runtime/modules/index'

// 将平台模块和基础模块整合成最终模块数组
// 注意注释：directive module（指令模块）应该最后应用
// 因为它依赖之前所有内置模块的处理结果
const modules = platformModules.concat(baseModules)

// 调用 createPatchFunction 生成最终的 patch 函数
// patch 函数是 Vue 渲染 VNode 树到真实 DOM 的核心函数
// 参数说明：
// - nodeOps: 底层 DOM 操作接口（createElement, appendChild, removeChild 等）
// - modules: 各种模块，用来处理属性、class、style、事件、指令等
export const patch: Function = createPatchFunction({ nodeOps, modules })
