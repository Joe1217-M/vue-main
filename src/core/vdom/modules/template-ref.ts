import {
  remove,
  isDef,
  hasOwn,
  isArray,
  isFunction,
  invokeWithErrorHandling,
  warn
} from 'core/util'
import type { VNodeWithData } from 'types/vnode'
import { Component } from 'types/component'
import { isRef } from 'v3'

export default {
  create(_: any, vnode: VNodeWithData) {
    registerRef(vnode)
  },
  update(oldVnode: VNodeWithData, vnode: VNodeWithData) {
    if (oldVnode.data.ref !== vnode.data.ref) {
      registerRef(oldVnode, true)
      registerRef(vnode)
    }
  },
  destroy(vnode: VNodeWithData) {
    registerRef(vnode, true)
  }
}
// <div ref="box"></div>
// <MyDialog ref="dialog" />

// <div v-for="i in list" ref="row"></div>

// <script setup>
//   const comp = ref(null)
// </script>
// <MyDialog :ref="comp" />

// <MyDialog :ref="el => console.log(el)" />

// 负责注册或移除 template ref 的函数
export function registerRef(vnode: VNodeWithData, isRemoval?: boolean) {
  const ref = vnode.data.ref      // 获取 ref 表达式（string / function / ref() 等）
  if (!isDef(ref)) return          // 如果不存在 ref，直接返回

  const vm = vnode.context         // 当前 vnode 所属的组件实例（父组件）
  const refValue = vnode.componentInstance || vnode.elm   // ref 要指向的对象（组件实例或 DOM）
  const value = isRemoval ? null : refValue               // 用于 options API $refs
  const $refsValue = isRemoval ? undefined : refValue     // 用于模板 refs

  if (isFunction(ref)) {
    // 如果 ref 是一个回调函数形式：ref="el => xxx"
    // 直接调用用户函数，并传入真实值
    invokeWithErrorHandling(ref, vm, [value], vm, `template ref function`)
    return
  }

  const isFor = vnode.data.refInFor                       // 是否在 v-for 内使用 ref
  const _isString = typeof ref === 'string' || typeof ref === 'number'  // 普通 template ref
  const _isRef = isRef(ref)                               // 组合式 API 的 ref 对象
  const refs = vm.$refs                                   // 父组件的 $refs 引用容器

  if (_isString || _isRef) {
    // ref 既可以是 string（template ref）或 ref()（组合式 API ref）
    if (isFor) {
      // ---------- 处理 v-for 中的 ref（总是数组） ----------
      const existing = _isString ? refs[ref] : ref.value  // 当前已存在的数组值

      if (isRemoval) {                                    // 删除阶段
        isArray(existing) && remove(existing, refValue)   // 从列表移除
      } else {
        if (!isArray(existing)) {
          // 若首次创建，还没有数组，则初始化为数组
          if (_isString) {
            refs[ref] = [refValue]                        // $refs.xxx = []
            setSetupRef(vm, ref, refs[ref])               // 处理组合式 API 下同步
          } else {
            ref.value = [refValue]                        // ref([]) for composition API
          }
        } else if (!existing.includes(refValue)) {
          existing.push(refValue)                         // 多次 push 创建多个组件实例
        }
      }

    } else if (_isString) {
      // ---------- 普通 ref，不在 v-for 中 ----------
      if (isRemoval && refs[ref] !== refValue) {
        return                                             // 如果被覆盖过，跳过删除
      }
      refs[ref] = $refsValue                               // 普通注册：$refs.xxx = instance|element
      setSetupRef(vm, ref, value)                          // 同步给 composition API

    } else if (_isRef) {
      // ---------- ref() 模式，多用于 <script setup> ----------
      if (isRemoval && ref.value !== refValue) {
        return                                             // 防止覆盖错误
      }
      ref.value = value                                    // 设置 .value
    } else if (__DEV__) {
      warn(`Invalid template ref type: ${typeof ref}`)     // 错误警告
    }
  }
}

function setSetupRef(
  { _setupState }: Component,
  key: string | number,
  val: any
) {
  if (_setupState && hasOwn(_setupState, key as string)) {
    if (isRef(_setupState[key])) {
      _setupState[key].value = val
    } else {
      _setupState[key] = val
    }
  }
}
