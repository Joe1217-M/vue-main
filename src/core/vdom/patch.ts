/**
 * Virtual DOM patching algorithm based on Snabbdom by
 * Simon Friis Vindum (@paldepind)
 * Licensed under the MIT License
 * https://github.com/paldepind/snabbdom/blob/master/LICENSE
 *
 * modified by Evan You (@yyx990803)
 *
 * Not type-checking this because this file is perf-critical and the cost
 * of making flow understand it is not worth it.
 */

import VNode, { cloneVNode } from './vnode'
import config from '../config'
import { SSR_ATTR } from 'shared/constants'
import { registerRef } from './modules/template-ref'
import { traverse } from '../observer/traverse'
import { activeInstance } from '../instance/lifecycle'
import { isTextInputType } from 'web/util/element'

import {
  warn,
  isDef,
  isUndef,
  isTrue,
  isArray,
  makeMap,
  isRegExp,
  isPrimitive
} from '../util/index'

export const emptyNode = new VNode('', {}, [])

const hooks = ['create', 'activate', 'update', 'remove', 'destroy']

function sameVnode(a, b) {
  return (
    a.key === b.key &&
    a.asyncFactory === b.asyncFactory &&
    ((a.tag === b.tag &&
      a.isComment === b.isComment &&
      isDef(a.data) === isDef(b.data) &&
      sameInputType(a, b)) ||
      (isTrue(a.isAsyncPlaceholder) && isUndef(b.asyncFactory.error)))
  )
}

function sameInputType(a, b) {
  if (a.tag !== 'input') return true
  let i
  const typeA = isDef((i = a.data)) && isDef((i = i.attrs)) && i.type
  const typeB = isDef((i = b.data)) && isDef((i = i.attrs)) && i.type
  return typeA === typeB || (isTextInputType(typeA) && isTextInputType(typeB))
}

function createKeyToOldIdx(children, beginIdx, endIdx) {
  let i, key
  const map = {}
  for (i = beginIdx; i <= endIdx; ++i) {
    key = children[i].key
    if (isDef(key)) map[key] = i
  }
  return map
}

export function createPatchFunction(backend) {
  let i, j
  const cbs: any = {}

  const { modules, nodeOps } = backend

  for (i = 0; i < hooks.length; ++i) {
    cbs[hooks[i]] = []
    for (j = 0; j < modules.length; ++j) {
      if (isDef(modules[j][hooks[i]])) {
        cbs[hooks[i]].push(modules[j][hooks[i]])
      }
    }
  }

  function emptyNodeAt(elm) {
    return new VNode(nodeOps.tagName(elm).toLowerCase(), {}, [], undefined, elm)
  }

  function createRmCb(childElm, listeners) {
    function remove() {
      if (--remove.listeners === 0) {
        removeNode(childElm)
      }
    }
    remove.listeners = listeners
    return remove
  }

  function removeNode(el) {
    const parent = nodeOps.parentNode(el)
    // element may have already been removed due to v-html / v-text
    if (isDef(parent)) {
      nodeOps.removeChild(parent, el)
    }
  }

  function isUnknownElement(vnode, inVPre) {
    return (
      !inVPre &&
      !vnode.ns &&
      !(
        config.ignoredElements.length &&
        config.ignoredElements.some(ignore => {
          return isRegExp(ignore)
            ? ignore.test(vnode.tag)
            : ignore === vnode.tag
        })
      ) &&
      config.isUnknownElement(vnode.tag)
    )
  }

  let creatingElmInVPre = 0

//   createElm
//  ├─ createComponent?
//  │    ├─ 是 → 创建组件实例并插入 DOM
//  │    └─ 否 → 进入元素或文本处理
//  ├─ tag 存在?
//  │    ├─ 是 → 创建元素节点
//  │    │    ├─ createChildren
//  │    │    ├─ invokeCreateHooks
//  │    │    └─ insert DOM
//  │    └─ 否 → 处理注释 or 文本
//  └─ insert DOM
  function createElm(
    vnode,                   // 当前虚拟节点
    insertedVnodeQueue,      // 存放所有待插入的 vnode（组件或有 insert 钩子）
    parentElm?: any,         // 父 DOM 节点
    refElm?: any,            // 参考节点，用于 insertBefore
    nested?: any,            // 是否递归创建的子节点
    ownerArray?: any,        // 父 vnode 的 children 数组（如果 vnode 来自于数组）
    index?: any              // vnode 在父 children 数组中的索引
  ) {
    // ⚠️ 处理复用的 vnode
    if (isDef(vnode.elm) && isDef(ownerArray)) {
      // 说明这个 vnode 在之前渲染中已经使用过
      // 如果直接复用 elm 可能会导致 patch 错误
      // 所以这里 clone 一个新的 vnode，避免覆盖 elm
      vnode = ownerArray[index] = cloneVNode(vnode)
    }

    // 标记是否是根插入节点
    // !nested → true 表示这是根节点（非递归子节点）
    vnode.isRootInsert = !nested // for transition enter check

    // 如果 vnode 是组件，则先创建组件
    if (createComponent(vnode, insertedVnodeQueue, parentElm, refElm)) {
      return // 组件创建完成，直接返回
    }

    const data = vnode.data           // vnode 的数据对象
    const children = vnode.children   // vnode 的子节点
    const tag = vnode.tag             // 标签名或组件名

    if (isDef(tag)) {
      // vnode 是元素节点
      if (__DEV__) {
        if (data && data.pre) {
          // 当前 vnode 在 v-pre 中，计数器加一
          creatingElmInVPre++
        }
        // 开发环境下检查是否未知元素
        if (isUnknownElement(vnode, creatingElmInVPre)) {
          warn(
            'Unknown custom element: <' +
              tag +
              '> - did you ' +
              'register the component correctly? For recursive components, ' +
              'make sure to provide the "name" option.',
            vnode.context
          )
        }
      }

      // ✅ 创建真实 DOM
      vnode.elm = vnode.ns
        ? nodeOps.createElementNS(vnode.ns, tag) // 有命名空间（如 SVG）
        : nodeOps.createElement(tag, vnode)      // 普通 HTML 元素
      setScope(vnode)                             // 处理作用域 CSS

      // 递归创建子节点
      createChildren(vnode, children, insertedVnodeQueue)

      // 调用 vnode.data.hook.create 钩子
      if (isDef(data)) {
        invokeCreateHooks(vnode, insertedVnodeQueue)
      }

      // 插入到父节点或参考节点之前
      insert(parentElm, vnode.elm, refElm)

      // v-pre 结束，计数器减一
      if (__DEV__ && data && data.pre) {
        creatingElmInVPre--
      }
    } else if (isTrue(vnode.isComment)) {
      // vnode 是注释节点
      vnode.elm = nodeOps.createComment(vnode.text)
      insert(parentElm, vnode.elm, refElm)
    } else {
      // vnode 是文本节点
      vnode.elm = nodeOps.createTextNode(vnode.text)
      insert(parentElm, vnode.elm, refElm)
    }
  }

  function createComponent(vnode, insertedVnodeQueue, parentElm, refElm) {
    // vnode.data 是组件VNode的关键数据，其中包含生命周期hook、props、event listeners等
    let i = vnode.data

    // 判断 vnode.data 是否存在（组件 VNode 才会有 data 字段）
    if (isDef(i)) {
      // 判断是否是 keep-alive 组件重新激活的情况
      const isReactivated = isDef(vnode.componentInstance) && i.keepAlive

      // 获取组件VNode中的hook对象，再取其中的 init 方法
      // init hook 负责创建组件实例（new Vue(options)）
      if (isDef((i = i.hook)) && isDef((i = i.init))) {
        // 执行 init 钩子，初始化组件实例
        // 第二个参数 false 表示不是 ssr hydration 渲染
        i(vnode, false /* hydrating */)
      }

      // 执行 init 之后，如果组件实例已经创建好了
      // vnode.componentInstance 就会被设置为该实例
      // 同时实例的 $el 已经挂载在 vnode.elm 上
      if (isDef(vnode.componentInstance)) {
        // 初始化组件：调用组件内部 create 钩子，处理 ref
        initComponent(vnode, insertedVnodeQueue)

        // 将组件根DOM插入父元素中
        insert(parentElm, vnode.elm, refElm)

        // 如果 keep-alive 且是重新激活状态，执行激活逻辑
        if (isTrue(isReactivated)) {
          reactivateComponent(vnode, insertedVnodeQueue, parentElm, refElm)
        }

        // 返回 true 表示这是一个组件 vnode，并且成功创建
        return true
      }
    }
  }

  // 初始化组件 vnode，将 componentInstance.$el 作为 vnode.elm 挂载到 DOM 树中
  function initComponent(vnode, insertedVnodeQueue) {

    // 如果当前 vnode.data.pendingInsert 存在，
    // 表示在组件内部 create 过程中产生了一些待执行的 insert 钩子（比如 transition 动画）
    if (isDef(vnode.data.pendingInsert)) {

      // 将 pendingInsert 中的钩子合并到 insertedVnodeQueue
      insertedVnodeQueue.push.apply(
        insertedVnodeQueue,
        vnode.data.pendingInsert
      )

      // 清空 pendingInsert，避免重复执行
      vnode.data.pendingInsert = null
    }

    // 将组件实例的根 DOM 节点($el) 赋给 vnode.elm
    // $el 是组件最终渲染出来的真实 DOM 元素
    vnode.elm = vnode.componentInstance.$el

    // 如果 vnode 是“可 patch”的（即不是注释/空节点）
    if (isPatchable(vnode)) {

      // 调用 create 钩子(例如 directive、ref、attrs、class、style 模块)
      // 相当于用于元素初始化阶段的 patch modules hooks
      invokeCreateHooks(vnode, insertedVnodeQueue)

      // 设置 style scope（处理 scoped CSS），确保样式隔离正确
      setScope(vnode)

    } else {
      // 如果组件根节点是空节点（比如 functional component 或注释节点）
      // 则只执行 ref，并且不会执行 element 相关的模块

      // 注册 ref（用于父组件通过 ref 获取子组件实例）
      registerRef(vnode)

      // 仍然需要触发 insert 钩子，这样生命周期钩子才能运行（比如 mounted）
      insertedVnodeQueue.push(vnode)
    }
  }

  function reactivateComponent(vnode, insertedVnodeQueue, parentElm, refElm) {
    let i
    // #4339 issue 相关 hack：当 keep-alive 组件内部包含 transition 过渡动画时，
    // 因为组件是从缓存取出的（不是重新创建），内部 vnode 的 created hook 不会再次触发，
    // 导致过渡动画无法执行，所以这里手动触发 activate 钩子。

    let innerNode = vnode  // 从当前 vnode 开始向内查找子组件(可能嵌套)
    while (innerNode.componentInstance) {
      // 进入子组件的内部 vnode
      innerNode = innerNode.componentInstance._vnode

      // 判断内部 vnode 是否包含 transition 数据
      if (isDef((i = innerNode.data)) && isDef((i = i.transition))) {
        // 如果存在 transition 过渡，则调用 activate 钩子组
        for (i = 0; i < cbs.activate.length; ++i) {
          cbs.activate[i](emptyNode, innerNode)  // 执行 transition 的 activate 钩子
        }

        // 将内部 vnode 推入插入队列，稍后调用 insert 钩子
        insertedVnodeQueue.push(innerNode)
        break  // 找到一个 transition 节点后就退出循环
      }
    }

    // 与全新创建的组件不同，
    // 被 keep-alive 重新激活的组件不会自动插入 DOM，
    // 因此需要手动插入 DOM
    insert(parentElm, vnode.elm, refElm)
  }

  function insert(parent, elm, ref) {
    if (isDef(parent)) {
      if (isDef(ref)) {
        if (nodeOps.parentNode(ref) === parent) {
          nodeOps.insertBefore(parent, elm, ref)
        }
      } else {
        nodeOps.appendChild(parent, elm)
      }
    }
  }

  function createChildren(vnode, children, insertedVnodeQueue) {
    // 如果 children 是数组（即有多个子节点，例如 <div><span/><p/></div>）
    if (isArray(children)) {

      // 开发环境下检查 v-for key 是否重复，避免 diff 过程中出现混乱
      if (__DEV__) {
        checkDuplicateKeys(children)
      }

      // 遍历子节点，逐个创建并插入到父节点 vnode.elm 中
      for (let i = 0; i < children.length; ++i) {
        createElm(
          children[i],             // 当前子 vnode
          insertedVnodeQueue,      // 插入队列（用于后续执行 insert 钩子）
          vnode.elm,               // 父节点真实 DOM（将创建后的 elm 插入这里）
          null,                    // 不需要参考节点(refElm)
          true,                    // nested: 标记嵌套 isRootInsert = true
          children,                // 子 nodes 数组上下文
          i                        // 当前索引
        )
      }

    // 否则如果 vnode.text 是原始类型（string / number），表示是文本节点
    } else if (isPrimitive(vnode.text)) {
      // 直接创建文本节点并挂载到 vnode.elm 下
      nodeOps.appendChild(
        vnode.elm,
        nodeOps.createTextNode(String(vnode.text))
      )
    }
  }

  function isPatchable(vnode) {
    while (vnode.componentInstance) {
      vnode = vnode.componentInstance._vnode
    }
    return isDef(vnode.tag)
  }

  function invokeCreateHooks(vnode, insertedVnodeQueue) {
    // 1️⃣ 调用全局模块的 create 钩子（cbs.create 是 patch 初始化时收集的模块钩子集合）
    //cbs.create 的钩子只是给 当前 vnode DOM 初始化“附加功能”
    //    例如：attrs、class、style、events、domProps、directives、transition 等模块
    for (let i = 0; i < cbs.create.length; ++i) {
      cbs.create[i](emptyNode, vnode) // 第一个参数 emptyNode 表示旧节点为空（初次创建）
    }

    // 2️⃣ 调用 vnode 自身 data.hook 上定义的 create / insert 钩子
    i = vnode.data.hook  // 重用变量 i

    if (isDef(i)) { // vnode.data.hook 存在才执行
      if (isDef(i.create)) i.create(emptyNode, vnode) // 执行 vnode 自己的 create 钩子
      if (isDef(i.insert)) insertedVnodeQueue.push(vnode) // vnode 的 insert 钩子稍后统一执行
    }
  }

  // set scope id attribute for scoped CSS.
  // this is implemented as a special case to avoid the overhead
  // of going through the normal attribute patching process.
  function setScope(vnode) {
    let i
    if (isDef((i = vnode.fnScopeId))) {
      nodeOps.setStyleScope(vnode.elm, i)
    } else {
      let ancestor = vnode
      while (ancestor) {
        if (isDef((i = ancestor.context)) && isDef((i = i.$options._scopeId))) {
          nodeOps.setStyleScope(vnode.elm, i)
        }
        ancestor = ancestor.parent
      }
    }
    // for slot content they should also get the scopeId from the host instance.
    if (
      isDef((i = activeInstance)) &&
      i !== vnode.context &&
      i !== vnode.fnContext &&
      isDef((i = i.$options._scopeId))
    ) {
      nodeOps.setStyleScope(vnode.elm, i)
    }
  }

  function addVnodes(
    parentElm,
    refElm,
    vnodes,
    startIdx,
    endIdx,
    insertedVnodeQueue
  ) {
    for (; startIdx <= endIdx; ++startIdx) {
      createElm(
        vnodes[startIdx],
        insertedVnodeQueue,
        parentElm,
        refElm,
        false,
        vnodes,
        startIdx
      )
    }
  }

  function invokeDestroyHook(vnode) {
    let i, j
    const data = vnode.data
    if (isDef(data)) {
      if (isDef((i = data.hook)) && isDef((i = i.destroy))) i(vnode)
      for (i = 0; i < cbs.destroy.length; ++i) cbs.destroy[i](vnode)
    }
    if (isDef((i = vnode.children))) {
      for (j = 0; j < vnode.children.length; ++j) {
        invokeDestroyHook(vnode.children[j])
      }
    }
  }

  function removeVnodes(vnodes, startIdx, endIdx) {
    // 从 startIdx 遍历到 endIdx
    for (; startIdx <= endIdx; ++startIdx) {
      const ch = vnodes[startIdx]   // 当前 vnode

      if (isDef(ch)) {   // ch 存在才删除
        if (isDef(ch.tag)) {
          // ch.tag 存在说明是元素节点（如 div、span、component）
          // 组件或元素节点需要触发删除 & destroy 钩子
          removeAndInvokeRemoveHook(ch) // 执行节点的 remove 钩子并从 DOM 中移除
          invokeDestroyHook(ch)         // 执行 destroy 钩子（销毁组件、指令等）
        } else {
          // 没有 tag，说明是文本节点 (text node)
          removeNode(ch.elm) // 直接删除 DOM text 节点
        }
      }
    }
  }

  // 执行 vnode 删除逻辑，并触发相关的 remove 钩子
  function removeAndInvokeRemoveHook(vnode, rm?: any) {

    // 如果存在递归传递的 rm 回调，或者 vnode.data 存在
    // 才需要触发 remove hook，否则直接删除 DOM 节点
    if (isDef(rm) || isDef(vnode.data)) {

      let i
      // 当前 vnode 需要等待执行的 remove 钩子数量：模块钩子数量 + 1（vnode 自身的 remove）
      const listeners = cbs.remove.length + 1

      if (isDef(rm)) {
        // 如果 rm 已存在，说明是嵌套组件递归调用进来的
        // 增加等待执行完成的回调数量
        rm.listeners += listeners
      } else {
        // 如果 rm 不存在说明是第一个要删除的节点
        // 创建一个回调函数 rm，当所有 remove 钩子执行完后调用 rm 来真正删除 DOM 节点
        rm = createRmCb(vnode.elm, listeners)
      }

      // 如果 vnode 是组件，递归调用子组件 rootVNode 的 remove 逻辑
      if (
        isDef((i = vnode.componentInstance)) &&
        isDef((i = i._vnode)) &&
        isDef(i.data)
      ) {
        removeAndInvokeRemoveHook(i, rm)
      }

      // 执行全局模块级 remove 钩子，例如 directive、transition 等模块扩展的逻辑
      for (i = 0; i < cbs.remove.length; ++i) {
        cbs.remove[i](vnode, rm)
      }

      // 如果 vnode.data.hook.remove 存在，表示 vnode 定义了自己的 remove 钩子
      if (isDef((i = vnode.data.hook)) && isDef((i = i.remove))) {
        // 执行自定义 remove 钩子
        i(vnode, rm)
      } else {
        // 没有 remove 钩子，直接调用 rm（可能是销毁属性动画等异步机制）
        rm()
      }

    } else {
      // 没有 rm 回调且没有 data，说明没有钩子需要执行，直接删除 DOM
      removeNode(vnode.elm)
    }
  }

  function updateChildren(
    parentElm,        // 父真实 DOM
    oldCh,            // 旧 children 数组
    newCh,            // 新 children 数组
    insertedVnodeQueue,
    removeOnly        // <transition-group> 时为 true，禁止移动节点
  ) {
    let oldStartIdx = 0
    let newStartIdx = 0
    let oldEndIdx = oldCh.length - 1
    let newEndIdx = newCh.length - 1
    // 双端指针对应的 vnode
    let oldStartVnode = oldCh[0]
    let oldEndVnode = oldCh[oldEndIdx]
    let newStartVnode = newCh[0]
    let newEndVnode = newCh[newEndIdx]
    let oldKeyToIdx, idxInOld, vnodeToMove, refElm

    // 是否允许移动 DOM（transition-group 用）
    const canMove = !removeOnly

    // 避免 newCh 中重复 key
    if (__DEV__) {
      checkDuplicateKeys(newCh)
    }

    // 四指针循环比较
    while (oldStartIdx <= oldEndIdx && newStartIdx <= newEndIdx) {

      // 跳过 undefined 的占位（已被移动过）
      if (isUndef(oldStartVnode)) {
        oldStartVnode = oldCh[++oldStartIdx]
      } else if (isUndef(oldEndVnode)) {
        oldEndVnode = oldCh[--oldEndIdx]

      // Case 1：旧头 vs 新头
      } else if (sameVnode(oldStartVnode, newStartVnode)) {
        patchVnode(oldStartVnode, newStartVnode, insertedVnodeQueue, newCh, newStartIdx)
        oldStartVnode = oldCh[++oldStartIdx]
        newStartVnode = newCh[++newStartIdx]

      // Case 2：旧尾 vs 新尾
      } else if (sameVnode(oldEndVnode, newEndVnode)) {
        patchVnode(oldEndVnode, newEndVnode, insertedVnodeQueue, newCh, newEndIdx)
        oldEndVnode = oldCh[--oldEndIdx]
        newEndVnode = newCh[--newEndIdx]

      // Case 3：旧头 vs 新尾（节点向右移动）
      } else if (sameVnode(oldStartVnode, newEndVnode)) {
        patchVnode(oldStartVnode, newEndVnode, insertedVnodeQueue, newCh, newEndIdx)
        canMove && nodeOps.insertBefore(parentElm, oldStartVnode.elm, nodeOps.nextSibling(oldEndVnode.elm))
        oldStartVnode = oldCh[++oldStartIdx]
        newEndVnode = newCh[--newEndIdx]

      // Case 4：旧尾 vs 新头（节点向左移动）
      } else if (sameVnode(oldEndVnode, newStartVnode)) {
        patchVnode(oldEndVnode, newStartVnode, insertedVnodeQueue, newCh, newStartIdx)
        canMove && nodeOps.insertBefore(parentElm, oldEndVnode.elm, oldStartVnode.elm)
        oldEndVnode = oldCh[--oldEndIdx]
        newStartVnode = newCh[++newStartIdx]

      } else {
        // 通过 key 建立旧 children 的 key -> index 映射
        if (isUndef(oldKeyToIdx))
          oldKeyToIdx = createKeyToOldIdx(oldCh, oldStartIdx, oldEndIdx)

        // 查看新头节点是否在旧 children 中存在
        idxInOld = isDef(newStartVnode.key)
          ? oldKeyToIdx[newStartVnode.key]   // key diff
          : findIdxInOld(newStartVnode, oldCh, oldStartIdx, oldEndIdx)  // 没 key 则遍历找

        if (isUndef(idxInOld)) {
          // 旧中不存在 -> 新节点，直接创建并插入
          createElm(newStartVnode, insertedVnodeQueue, parentElm, oldStartVnode.elm)

        } else {
          // 拿到旧节点准备复用
          vnodeToMove = oldCh[idxInOld]

          if (sameVnode(vnodeToMove, newStartVnode)) {
            patchVnode(vnodeToMove, newStartVnode, insertedVnodeQueue, newCh, newStartIdx)
            oldCh[idxInOld] = undefined // 置空占位
            canMove && nodeOps.insertBefore(parentElm, vnodeToMove.elm, oldStartVnode.elm)
          } else {
            // key 相同但不同类型，不能复用 -> 新建
            createElm(newStartVnode, insertedVnodeQueue, parentElm, oldStartVnode.elm)
          }
        }
        newStartVnode = newCh[++newStartIdx]
      }
    }

    // 剩余新节点 -> 追加
    if (oldStartIdx > oldEndIdx) {
      refElm = isUndef(newCh[newEndIdx + 1]) ? null : newCh[newEndIdx + 1].elm
      addVnodes(parentElm, refElm, newCh, newStartIdx, newEndIdx, insertedVnodeQueue)

    // 剩余旧节点 -> 删除
    } else if (newStartIdx > newEndIdx) {
      removeVnodes(oldCh, oldStartIdx, oldEndIdx)
    }
  }

  function checkDuplicateKeys(children) {
    const seenKeys = {}
    for (let i = 0; i < children.length; i++) {
      const vnode = children[i]
      const key = vnode.key
      if (isDef(key)) {
        if (seenKeys[key]) {
          warn(
            `Duplicate keys detected: '${key}'. This may cause an update error.`,
            vnode.context
          )
        } else {
          seenKeys[key] = true
        }
      }
    }
  }

  function findIdxInOld(node, oldCh, start, end) {
    for (let i = start; i < end; i++) {
      const c = oldCh[i]
      if (isDef(c) && sameVnode(node, c)) return i
    }
  }

  function patchVnode(
    oldVnode,
    vnode,
    insertedVnodeQueue,
    ownerArray,
    index,
    removeOnly?: any
  ) {
    if (oldVnode === vnode) {
      return
    }

    if (isDef(vnode.elm) && isDef(ownerArray)) {
      // clone reused vnode
      vnode = ownerArray[index] = cloneVNode(vnode)
    }

    const elm = (vnode.elm = oldVnode.elm)

    if (isTrue(oldVnode.isAsyncPlaceholder)) {
      if (isDef(vnode.asyncFactory.resolved)) {
        hydrate(oldVnode.elm, vnode, insertedVnodeQueue)
      } else {
        vnode.isAsyncPlaceholder = true
      }
      return
    }

    // reuse element for static trees.
    // note we only do this if the vnode is cloned -
    // if the new node is not cloned it means the render functions have been
    // reset by the hot-reload-api and we need to do a proper re-render.
    if (
      isTrue(vnode.isStatic) &&
      isTrue(oldVnode.isStatic) &&
      vnode.key === oldVnode.key &&
      (isTrue(vnode.isCloned) || isTrue(vnode.isOnce))
    ) {
      vnode.componentInstance = oldVnode.componentInstance
      return
    }

    let i
    const data = vnode.data
    if (isDef(data) && isDef((i = data.hook)) && isDef((i = i.prepatch))) {
      i(oldVnode, vnode)
    }

    const oldCh = oldVnode.children
    const ch = vnode.children
    if (isDef(data) && isPatchable(vnode)) {
      for (i = 0; i < cbs.update.length; ++i) cbs.update[i](oldVnode, vnode)
      if (isDef((i = data.hook)) && isDef((i = i.update))) i(oldVnode, vnode)
    }
    if (isUndef(vnode.text)) {
      if (isDef(oldCh) && isDef(ch)) {
        if (oldCh !== ch)
          updateChildren(elm, oldCh, ch, insertedVnodeQueue, removeOnly)
      } else if (isDef(ch)) {
        if (__DEV__) {
          checkDuplicateKeys(ch)
        }
        if (isDef(oldVnode.text)) nodeOps.setTextContent(elm, '')
        addVnodes(elm, null, ch, 0, ch.length - 1, insertedVnodeQueue)
      } else if (isDef(oldCh)) {
        removeVnodes(oldCh, 0, oldCh.length - 1)
      } else if (isDef(oldVnode.text)) {
        nodeOps.setTextContent(elm, '')
      }
    } else if (oldVnode.text !== vnode.text) {
      nodeOps.setTextContent(elm, vnode.text)
    }
    if (isDef(data)) {
      if (isDef((i = data.hook)) && isDef((i = i.postpatch))) i(oldVnode, vnode)
    }
  }

  function invokeInsertHook(vnode, queue, initial) {
    // delay insert hooks for component root nodes, invoke them after the
    // element is really inserted
    if (isTrue(initial) && isDef(vnode.parent)) {
      vnode.parent.data.pendingInsert = queue
    } else {
      for (let i = 0; i < queue.length; ++i) {
        queue[i].data.hook.insert(queue[i])
      }
    }
  }

  let hydrationBailed = false
  // 可以跳过在 hydration 阶段创建的 module 列表
  // 因为这些模块要么已经在 SSR 阶段生成，要么不需要客户端初始化。
  // （注意：style 不在其中，因为 style 在深层更新中需要初始的 clone）
  const isRenderedModule = makeMap('attrs,class,staticClass,staticStyle,key')

  // hydration：客户端用真实 DOM(elm) 匹配 vnode 并绑定事件 / 更新差异
  // elm: 已经 SSR 生成的 DOM 节点
  // vnode: 客户端生成的虚拟节点
  // insertedVnodeQueue: 记录 inserted 钩子队列
  // inVPre: 标记是否在 v-pre 作用域内
  function hydrate(elm, vnode, insertedVnodeQueue, inVPre?: boolean) {
    let i
    const { tag, data, children } = vnode

    // v-pre 的继承
    inVPre = inVPre || (data && data.pre)

    // 将真实 DOM 挂到 vnode.elm 上
    vnode.elm = elm

    // 异步组件占位符情况
    if (isTrue(vnode.isComment) && isDef(vnode.asyncFactory)) {
      vnode.isAsyncPlaceholder = true
      return true
    }

    // 开发环境断言 DOM 节点是否与 vnode 匹配，否则 hydration 失败进入完整 patch
    if (__DEV__) {
      if (!assertNodeMatch(elm, vnode, inVPre)) {
        return false
      }
    }

    // 处理 data hook，例如 init
    if (isDef(data)) {
      if (isDef((i = data.hook)) && isDef((i = i.init)))
        i(vnode, true /* hydrating */)

      // 如果 vnode 是组件，则执行 initComponent 并结束 hydration
      if (isDef((i = vnode.componentInstance))) {
        initComponent(vnode, insertedVnodeQueue)
        return true
      }
    }

    // 普通元素节点处理
    if (isDef(tag)) {
      if (isDef(children)) {
        // SSR 生成的 DOM 没有子节点，客户端创建 vnode children
        if (!elm.hasChildNodes()) {
          createChildren(vnode, children, insertedVnodeQueue)

        } else {
          // 如果是 innerHTML 渲染（v-html 或 domProps.innerHTML）
          if (
            isDef((i = data)) &&
            isDef((i = i.domProps)) &&
            isDef((i = i.innerHTML))
          ) {
            // DOM 内容应与 vnode.domProps.innerHTML一致，否则放弃 hydration
            if (i !== elm.innerHTML) {
              if (__DEV__ && typeof console !== 'undefined' && !hydrationBailed) {
                hydrationBailed = true
                console.warn('Parent: ', elm)
                console.warn('server innerHTML: ', i)
                console.warn('client innerHTML: ', elm.innerHTML)
              }
              return false
            }

          } else {
            // 没有 v-html → diff 子节点
            let childrenMatch = true
            let childNode = elm.firstChild
            for (let i = 0; i < children.length; i++) {
              // 递归 hydrate
              if (!childNode || !hydrate(childNode, children[i], insertedVnodeQueue, inVPre)) {
                childrenMatch = false
                break
              }
              childNode = childNode.nextSibling
            }
            // 如果 childNode 不为空，说明真实 DOM 比 vnode children 多 → hydration 失败
            if (!childrenMatch || childNode) {
              if (__DEV__ && typeof console !== 'undefined' && !hydrationBailed) {
                hydrationBailed = true
                console.warn('Parent: ', elm)
                console.warn('Mismatching childNodes vs. VNodes: ', elm.childNodes, children)
              }
              return false
            }
          }
        }
      }

      // 处理 vnode 数据 module create 钩子
      if (isDef(data)) {
        let fullInvoke = false
        // 遍历 data，如果 key 不在 isRenderedModule 中，需要执行 createHooks
        for (const key in data) {
          if (!isRenderedModule(key)) {
            fullInvoke = true
            invokeCreateHooks(vnode, insertedVnodeQueue)
            break
          }
        }

        // class 特殊处理：深度收集依赖
        if (!fullInvoke && data['class']) {
          traverse(data['class'])
        }
      }

    // 处理文本节点 hydration
    } else if (elm.data !== vnode.text) {
      elm.data = vnode.text
    }

    return true
  }

  function assertNodeMatch(node, vnode, inVPre) {
    if (isDef(vnode.tag)) {
      return (
        vnode.tag.indexOf('vue-component') === 0 ||
        (!isUnknownElement(vnode, inVPre) && vnode.tag.toLowerCase() === (node.tagName && node.tagName.toLowerCase()))
      )
    } else {
      return node.nodeType === (vnode.isComment ? 8 : 3)
    }
  }

  return function patch(oldVnode, vnode, hydrating, removeOnly) {
    if (isUndef(vnode)) {
      if (isDef(oldVnode)) invokeDestroyHook(oldVnode)
      return
    }

    let isInitialPatch = false
    const insertedVnodeQueue: any[] = []

    if (isUndef(oldVnode)) {
      // empty mount (likely as component), create new root element
      isInitialPatch = true
      createElm(vnode, insertedVnodeQueue)
    } else {
      const isRealElement = isDef(oldVnode.nodeType)
      if (!isRealElement && sameVnode(oldVnode, vnode)) {
        // patch existing root node
        patchVnode(oldVnode, vnode, insertedVnodeQueue, null, null, removeOnly)
      } else {
        if (isRealElement) {
          // mounting to a real element
          // check if this is server-rendered content and if we can perform
          // a successful hydration.
          if (oldVnode.nodeType === 1 && oldVnode.hasAttribute(SSR_ATTR)) {
            oldVnode.removeAttribute(SSR_ATTR)
            hydrating = true
          }
          if (isTrue(hydrating)) {
            if (hydrate(oldVnode, vnode, insertedVnodeQueue)) {
              invokeInsertHook(vnode, insertedVnodeQueue, true)
              return oldVnode
            } else if (__DEV__) {
              warn(
                'The client-side rendered virtual DOM tree is not matching ' +
                  'server-rendered content. This is likely caused by incorrect ' +
                  'HTML markup, for example nesting block-level elements inside ' +
                  '<p>, or missing <tbody>. Bailing hydration and performing ' +
                  'full client-side render.'
              )
            }
          }
          // either not server-rendered, or hydration failed.
          // create an empty node and replace it
          oldVnode = emptyNodeAt(oldVnode)
        }

        // replacing existing element
        const oldElm = oldVnode.elm
        const parentElm = nodeOps.parentNode(oldElm)

        // create new node
        createElm(
          vnode,
          insertedVnodeQueue,
          // extremely rare edge case: do not insert if old element is in a
          // leaving transition. Only happens when combining transition +
          // keep-alive + HOCs. (#4590)
          oldElm._leaveCb ? null : parentElm,
          nodeOps.nextSibling(oldElm)
        )

        // update parent placeholder node element, recursively
        if (isDef(vnode.parent)) {
          let ancestor = vnode.parent
          const patchable = isPatchable(vnode)
          while (ancestor) {
            for (let i = 0; i < cbs.destroy.length; ++i) {
              cbs.destroy[i](ancestor)
            }
            ancestor.elm = vnode.elm
            if (patchable) {
              for (let i = 0; i < cbs.create.length; ++i) {
                cbs.create[i](emptyNode, ancestor)
              }
              // #6513
              // invoke insert hooks that may have been merged by create hooks.
              // e.g. for directives that uses the "inserted" hook.
              const insert = ancestor.data.hook.insert
              if (insert.merged) {
                // start at index 1 to avoid re-invoking component mounted hook
                // clone insert hooks to avoid being mutated during iteration.
                // e.g. for customed directives under transition group.
                const cloned = insert.fns.slice(1)
                for (let i = 0; i < cloned.length; i++) {
                  cloned[i]()
                }
              }
            } else {
              registerRef(ancestor)
            }
            ancestor = ancestor.parent
          }
        }

        // destroy old node
        if (isDef(parentElm)) {
          removeVnodes([oldVnode], 0, 0)
        } else if (isDef(oldVnode.tag)) {
          invokeDestroyHook(oldVnode)
        }
      }
    }

    invokeInsertHook(vnode, insertedVnodeQueue, isInitialPatch)
    return vnode.elm
  }
}
