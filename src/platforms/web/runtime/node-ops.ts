import VNode from 'core/vdom/vnode'
import { namespaceMap } from 'web/util/index'

// 创建普通 HTML 元素
export function createElement(tagName: string, vnode: VNode): Element {
  const elm = document.createElement(tagName) // 创建真实 DOM 元素
  if (tagName !== 'select') {                // select 特殊处理
    return elm
  }
  // 如果是 select 且有 multiple 属性，设置 multiple
  // 注意 false/null 会移除属性，undefined 不会
  if (
    vnode.data &&
    vnode.data.attrs &&
    vnode.data.attrs.multiple !== undefined
  ) {
    elm.setAttribute('multiple', 'multiple')
  }
  return elm
}

// 创建带命名空间的元素（如 SVG、MathML）
export function createElementNS(namespace: string, tagName: string): Element {
  return document.createElementNS(namespaceMap[namespace], tagName)
}

// 创建文本节点
export function createTextNode(text: string): Text {
  return document.createTextNode(text)
}

// 创建注释节点
export function createComment(text: string): Comment {
  return document.createComment(text)
}

// 将 newNode 插入到 parentNode 的 referenceNode 之前
export function insertBefore(
  parentNode: Node,
  newNode: Node,
  referenceNode: Node
) {
  parentNode.insertBefore(newNode, referenceNode)
}

// 从父节点中删除子节点
export function removeChild(node: Node, child: Node) {
  node.removeChild(child)
}

// 向父节点追加子节点
export function appendChild(node: Node, child: Node) {
  node.appendChild(child)
}

// 获取父节点
export function parentNode(node: Node) {
  return node.parentNode
}

// 获取当前节点的下一个兄弟节点
export function nextSibling(node: Node) {
  return node.nextSibling
}

// 获取节点标签名
export function tagName(node: Element): string {
  return node.tagName
}

// 设置节点文本内容
export function setTextContent(node: Node, text: string) {
  node.textContent = text
}

// 设置作用域样式属性（用于 scoped CSS）
export function setStyleScope(node: Element, scopeId: string) {
  node.setAttribute(scopeId, '')
}
