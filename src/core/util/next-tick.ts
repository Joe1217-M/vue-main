/* globals MutationObserver */

import { noop } from 'shared/util'
import { handleError } from './error'
import { isIE, isIOS, isNative } from './env'

export let isUsingMicroTask = false

const callbacks: Array<Function> = []
let pending = false

function flushCallbacks() {
  pending = false
  const copies = callbacks.slice(0)
  callbacks.length = 0
  for (let i = 0; i < copies.length; i++) {
    copies[i]()
  }
}

// 这里我们使用了基于 microtask 的异步延迟包装。
// 在 2.5 版本中，我们使用的是（macro）task（并结合 microtask）。
// 然而，当状态在重绘（repaint）前被修改时，会出现一些微妙的问题
// （例如 #6813，out-in 过渡）。
// 此外，在事件处理函数中使用（macro）task 会导致一些无法规避的怪异行为
// （例如 #7109、#7153、#7546、#7834、#8109）。
// 因此我们现在再次在所有地方使用 microtask。
// 这种取舍的一个主要缺点是：在某些场景中，microtask 的优先级过高，
// 会在一些本应顺序执行的事件之间触发
// （例如 #4521、#6690，这些问题有解决方案）
// 甚至会在同一个事件的冒泡过程中触发（#6566）。
let timerFunc

// nextTick 的行为依赖于 microtask 队列，该队列可以通过原生的 Promise.then 或 MutationObserver 来访问。
// MutationObserver 支持更广泛，然而在 iOS >= 9.3.3 的 UIWebView 中，如果在 touch 事件处理函数里触发它，
// 会出现严重的 bug。触发几次之后它就完全失效……
// 因此，如果原生 Promise 可用，我们将优先使用 Promise。
/* istanbul ignore next, $flow-disable-line */
if (typeof Promise !== 'undefined' && isNative(Promise)) {
  const p = Promise.resolve()
  timerFunc = () => {
    p.then(flushCallbacks)
  // 在有问题的 UIWebView 中，Promise.then 并不会完全失效，
  // 但是可能会进入一种奇怪的状态：回调被推入 microtask 队列，
  // 队列却没有被刷新，直到浏览器需要处理其他任务，例如处理定时器。
  // 因此，我们可以通过添加一个空的定时器来“强制”刷新 microtask 队列。
    if (isIOS) setTimeout(noop)
  }
  isUsingMicroTask = true
} else if (
  !isIE &&
  typeof MutationObserver !== 'undefined' &&
  (isNative(MutationObserver) ||
    // PhantomJS and iOS 7.x
    MutationObserver.toString() === '[object MutationObserverConstructor]')
) {
  // 当原生 Promise 不可用时，使用 MutationObserver，
  // 例如 PhantomJS、iOS7、Android 4.4
  // （#6466 在 IE11 中 MutationObserver 不可靠）
  let counter = 1
  const observer = new MutationObserver(flushCallbacks)
  const textNode = document.createTextNode(String(counter))
  observer.observe(textNode, {
    characterData: true
  })
  timerFunc = () => {
    counter = (counter + 1) % 2
    textNode.data = String(counter)
  }
  isUsingMicroTask = true
} else if (typeof setImmediate !== 'undefined' && isNative(setImmediate)) {
  // 回退到 setImmediate。
  // 从技术上来说，它利用的是（macro）task 队列，
  // 但仍然比 setTimeout 更合适。
  timerFunc = () => {
    setImmediate(flushCallbacks)
  }
} else {
  // 回退到 setTimeout。
  timerFunc = () => {
    setTimeout(flushCallbacks, 0)
  }
}

export function nextTick(): Promise<void>
export function nextTick<T>(this: T, cb: (this: T, ...args: any[]) => any): void
export function nextTick<T>(cb: (this: T, ...args: any[]) => any, ctx: T): void
/**
 * @internal
 */
export function nextTick(cb?: (...args: any[]) => any, ctx?: object) {
  let _resolve
  callbacks.push(() => {
    if (cb) {
      try {
        cb.call(ctx)
      } catch (e: any) {
        handleError(e, ctx, 'nextTick')
      }
    } else if (_resolve) {
      _resolve(ctx)
    }
  })
  if (!pending) {
    pending = true
    timerFunc()
  }
  // $flow-disable-line
  if (!cb && typeof Promise !== 'undefined') {
    return new Promise(resolve => {
      _resolve = resolve
    })
  }
}
