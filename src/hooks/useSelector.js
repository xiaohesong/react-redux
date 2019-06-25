import { useReducer, useRef, useEffect, useMemo, useLayoutEffect } from 'react'
import invariant from 'invariant'
import { useReduxContext } from './useReduxContext'
import Subscription from '../utils/Subscription'

// React currently throws a warning when using useLayoutEffect on the server.
// To get around it, we can conditionally useEffect on the server (no-op) and
// useLayoutEffect in the browser. We need useLayoutEffect to ensure the store
// subscription callback always has the selector from the latest render commit
// available, otherwise a store update may happen between render and the effect,
// which may cause missed updates; we also must ensure the store subscription
// is created synchronously, otherwise a store update may occur before the
// subscription is created and an inconsistent state may be observed

const useIsomorphicLayoutEffect =
  // https://github.com/xiaohesong/til/blob/master/front-end/react/hooks/hooks-api.md#uselayouteffect
  typeof window !== 'undefined' ? useLayoutEffect : useEffect

const refEquality = (a, b) => a === b

/**
 * A hook to access the redux store's state. This hook takes a selector function
 * as an argument. The selector is called with the store state.
 *
 * This hook takes an optional equality comparison function as the second parameter
 * that allows you to customize the way the selected state is compared to determine
 * whether the component needs to be re-rendered.
 *
 * @param {Function} selector the selector function
 * @param {Function=} equalityFn the function that will be used to determine equality
 *
 * @returns {any} the selected state
 *
 * @example
 *
 * import React from 'react'
 * import { useSelector } from 'react-redux'
 *
 * export const CounterComponent = () => {
 *   const counter = useSelector(state => state.counter)
 *   return <div>{counter}</div>
 * }
 */
export function useSelector(selector, equalityFn = refEquality) {
  invariant(selector, `You must pass a selector to useSelectors`)

  // 这里直接使用`useContext`获取的。
  // useReduxContext内使用的就是useContext。
  const { store, subscription: contextSub } = useReduxContext()
  // 可以看见，把dispatch命名成forceRender, 是用于强制render。
  // useReducer的reducer和initState可以忽略不计，他就是为了做到class的forceUpdate的概念。
  const [, forceRender] = useReducer(s => s + 1, 0)

  // 这里和之前的逻辑类似
  const subscription = useMemo(() => new Subscription(store, contextSub), [
    store,
    contextSub
  ])

  // 需要获取上一次的情况，和现在的情况进行对比。
  // ref可以做到这个情况
  // 对于这个可以参考以下文章：
  // https://github.com/xiaohesong/til/blob/master/front-end/react/overreact/让setInterval在React-Hooks中为声明式.md
  // https://github.com/xiaohesong/til/blob/master/front-end/react/overreact/%E5%87%BD%E6%95%B0%E7%BB%84%E4%BB%B6%E4%B8%8E%E7%B1%BB%E6%9C%89%E4%BB%80%E4%B9%88%E4%B8%8D%E5%90%8C.md
  const latestSubscriptionCallbackError = useRef()
  const latestSelector = useRef()
  const latestSelectedState = useRef()

  let selectedState

  try {
    if (
      selector !== latestSelector.current ||
      latestSubscriptionCallbackError.current
    ) {
      // 如果selector方法不是上次的selector
      selectedState = selector(store.getState())
    } else {
      selectedState = latestSelectedState.current
    }
  } catch (err) {
    let errorMessage = `An error occured while selecting the store state: ${err.message}.`

    if (latestSubscriptionCallbackError.current) {
      errorMessage += `\nThe error may be correlated with this previous error:\n${latestSubscriptionCallbackError.current.stack}\n\nOriginal stack trace:`
    }

    throw new Error(errorMessage)
  }

  useIsomorphicLayoutEffect(() => {
    latestSelector.current = selector
    latestSelectedState.current = selectedState
    latestSubscriptionCallbackError.current = undefined
  })

  useIsomorphicLayoutEffect(() => {
    function checkForUpdates() {
      try {
        const newSelectedState = latestSelector.current(store.getState())

        // 如果相等，那就返回
        if (equalityFn(newSelectedState, latestSelectedState.current)) {
          return
        }

        latestSelectedState.current = newSelectedState
      } catch (err) {
        // we ignore all errors here, since when the component
        // is re-rendered, the selectors are called again, and
        // will throw again, if neither props nor store state
        // changed
        latestSubscriptionCallbackError.current = err
      }
      // 到这里就是不相等，那就重新render。
      forceRender({})
    }

    subscription.onStateChange = checkForUpdates
    subscription.trySubscribe()

    checkForUpdates()

    return () => subscription.tryUnsubscribe()
  }, [store, subscription])

  return selectedState
}
