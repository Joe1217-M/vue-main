import type { GlobalAPI } from 'types/global-api'
import { toArray, isFunction } from '../util/index'

export function initUse(Vue: GlobalAPI) {

  // 给 Vue 构造函数挂载一个静态方法 Vue.use
  Vue.use = function (plugin: Function | any) {

    // 缓存已安装的插件列表，避免重复安装
    const installedPlugins =
      this._installedPlugins || (this._installedPlugins = [])

    // 如果该插件已经被安装过，直接返回 Vue 避免重复调用
    if (installedPlugins.indexOf(plugin) > -1) {
      return this
    }

    // 获取除 plugin 以外的其他参数，比如 Vue.use(plugin, xxx, yyy)
    const args = toArray(arguments, 1)

    // Vue 实例本身必须是插件 install 函数的第一个参数
    args.unshift(this)

    // 如果 plugin 是对象且有 install 方法，则调用 install 方法
    if (isFunction(plugin.install)) {
      plugin.install.apply(plugin, args)

    // 如果 plugin 本身是函数，则直接调用它（插件可直接是一个函数）
    } else if (isFunction(plugin)) {
      plugin.apply(null, args)
    }

    // 标记插件已安装，避免重复安装
    installedPlugins.push(plugin)

    // 返回 Vue 方便链式调用
    return this
  }
}
