import config from '../config'
import { noop, isArray, isFunction } from 'shared/util'
import type { Component } from 'types/component'
import { currentInstance } from 'v3/currentInstance'
import { getComponentName } from '../vdom/create-component'

export let warn: (msg: string, vm?: Component | null) => void = noop
export let tip = noop
export let generateComponentTrace: (vm: Component) => string // work around flow check
export let formatComponentName: (vm: Component, includeFile?: false) => string


// 仅在开发环境启用
if (__DEV__) {
  const hasConsole = typeof console !== 'undefined'

  // 用于将 my-component 转成 MyComponent
  const classifyRE = /(?:^|[-_])(\w)/g
  const classify = str =>
    str.replace(classifyRE, c => c.toUpperCase()).replace(/[-_]/g, '')
  /**
   * Vue 的开发环境警告函数
   */
  warn = (msg, vm = currentInstance) => {
    const trace = vm ? generateComponentTrace(vm) : ''

    if (config.warnHandler) {
      // 用户自定义 warnHandler
      config.warnHandler.call(null, msg, vm, trace)
    } else if (hasConsole && !config.silent) {
       // 默认输出到控制台
      console.error(`[Vue warn]: ${msg}${trace}`)
    }
  }
  /**
   * Vue 的开发环境提示函数
   */
  tip = (msg, vm) => {
    if (hasConsole && !config.silent) {
      console.warn(`[Vue tip]: ${msg}` + (vm ? generateComponentTrace(vm) : ''))
    }
  }
  /**
   * 格式化组件名称，例如：
   * my-component   -> <MyComponent>
   * anonymous      -> <Anonymous>
   */
  formatComponentName = (vm, includeFile) => {
    if (vm.$root === vm) {
      return '<Root>'
    }
    const options =
      isFunction(vm) && (vm as any).cid != null
        ? (vm as any).options
        : vm._isVue
        ? vm.$options || (vm.constructor as any).options
        : vm
    let name = getComponentName(options)
    const file = options.__file
    if (!name && file) {
      const match = file.match(/([^/\\]+)\.vue$/)
      name = match && match[1]
    }

    return (
      (name ? `<${classify(name)}>` : `<Anonymous>`) +
      (file && includeFile !== false ? ` at ${file}` : '')
    )
  }
  /**
   * 更快的字符串重复
   */
  const repeat = (str, n) => {
    let res = ''
    while (n) {
      if (n % 2 === 1) res += str
      if (n > 1) str += str
      n >>= 1
    }
    return res
  }
  /**
   * 生成组件调用链（component trace）
   * 类似于：
   *
   * found in
   *
   * ---> <ChildComponent>
   *       <ParentComponent>
   *         <App>
   *
   * 并支持递归组件压缩：
   * <Tree>... (3 recursive calls)
   */
  generateComponentTrace = (vm: Component | undefined) => {
    if ((vm as any)._isVue && vm!.$parent) {
      const tree: any[] = []
      let currentRecursiveSequence = 0
      while (vm) {
        if (tree.length > 0) {
          const last = tree[tree.length - 1]
          if (last.constructor === vm.constructor) {
            currentRecursiveSequence++
            vm = vm.$parent!
            continue
          } else if (currentRecursiveSequence > 0) {
            tree[tree.length - 1] = [last, currentRecursiveSequence]
            currentRecursiveSequence = 0
          }
        }
        tree.push(vm)
        vm = vm.$parent!
      }
      return (
        '\n\nfound in\n\n' +
        tree
          .map(
            (vm, i) =>
              `${i === 0 ? '---> ' : repeat(' ', 5 + i * 2)}${
                isArray(vm)
                  ? `${formatComponentName(vm[0])}... (${
                      vm[1]
                    } recursive calls)`
                  : formatComponentName(vm)
              }`
          )
          .join('\n')
      )
    } else {
      return `\n\n(found in ${formatComponentName(vm!)})`
    }
  }
}
