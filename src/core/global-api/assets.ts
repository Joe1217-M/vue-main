import { ASSET_TYPES } from 'shared/constants'
import type { GlobalAPI } from 'types/global-api'
import { isFunction, isPlainObject, validateComponentName } from '../util/index'

export function initAssetRegisters(Vue: GlobalAPI) {
  /**
   * Vue 的资源类型注册函数：components / directives / filters
   * ASSET_TYPES = ['component', 'directive', 'filter']
   * 这个函数为 Vue 构造函数添加 `Vue.component`, `Vue.directive`, `Vue.filter` 方法
   */
  ASSET_TYPES.forEach(type => {
    // Vue[type] = function(id, definition?)
    // @ts-expect-error
    Vue[type] = function (
      id: string,
      definition?: Function | Object
    ): Function | Object | void {

      // 如果没有传入 definition，表示是 **获取** 已注册资源
      if (!definition) {
        return this.options[type + 's'][id]
      } else {
        // 开发环境校验组件名是否合法
        if (__DEV__ && type === 'component') {
          validateComponentName(id)
        }

        /**
         * 如果注册的是组件，且传入的是普通对象（非构造函数）
         * 使用 Vue.extend 转换成子类构造函数
         * 并保证 name 属性存在
         */
        if (type === 'component' && isPlainObject(definition)) {
          // @ts-expect-error
          definition.name = definition.name || id
          definition = this.options._base.extend(definition)
        }

        /**
         * 如果注册的是指令，且传入的是函数
         * 把函数同时赋给 bind 和 update
         * 方便简写
         */
        if (type === 'directive' && isFunction(definition)) {
          definition = { bind: definition, update: definition }
        }

        // 注册资源到全局 options
        this.options[type + 's'][id] = definition

        // 返回注册后的资源
        return definition
      }
    }
  })
}
