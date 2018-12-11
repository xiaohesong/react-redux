import verifyPlainObject from '../utils/verifyPlainObject'

export function defaultMergeProps(stateProps, dispatchProps, ownProps) {
  return { ...ownProps, ...stateProps, ...dispatchProps }
}

export function wrapMergePropsFunc(mergeProps) {
  return function initMergePropsProxy(
    dispatch, { displayName, pure, areMergedPropsEqual }
  ) {
    let hasRunOnce = false
    let mergedProps

    //这个相当于stateToProps,dispatchToProps的工厂函数`wrapMapToProps`的mapToPropsProxy类似，不过那里返回的是各自的props,这里返回的合并之后的props
    return function mergePropsProxy(stateProps, dispatchProps, ownProps) {
      // 下面的这个就是上面传参进来的初始的mergeProps,就是写在组建里的，但是一般不会写，所以这个就是在`connect.js`里初始化的mergeProps
      const nextMergedProps = mergeProps(stateProps, dispatchProps, ownProps)

      if (hasRunOnce) {
        if (!pure || !areMergedPropsEqual(nextMergedProps, mergedProps))
          mergedProps = nextMergedProps

      } else {
        hasRunOnce = true
        mergedProps = nextMergedProps

        if (process.env.NODE_ENV !== 'production')
          verifyPlainObject(mergedProps, displayName, 'mergeProps')
      }

      return mergedProps
    }
  }
}

export function whenMergePropsIsFunction(mergeProps) {
  return (typeof mergeProps === 'function')
    ? wrapMergePropsFunc(mergeProps)
    : undefined
}

//下面这个函数就是针对mergeProps是未定义的情况，会给你初始化一个。
export function whenMergePropsIsOmitted(mergeProps) {
  return (!mergeProps)
    ? () => defaultMergeProps
    : undefined
}

export default [
  whenMergePropsIsFunction,
  whenMergePropsIsOmitted
]
