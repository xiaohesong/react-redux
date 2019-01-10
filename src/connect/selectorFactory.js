import verifySubselectors from './verifySubselectors'

export function impureFinalPropsSelectorFactory(
  mapStateToProps,
  mapDispatchToProps,
  mergeProps,
  dispatch
) {
  return function impureFinalPropsSelector(state, ownProps) {
    return mergeProps(
      mapStateToProps(state, ownProps),
      mapDispatchToProps(dispatch, ownProps),
      ownProps
    )
  }
}

export function pureFinalPropsSelectorFactory(
  mapStateToProps,
  mapDispatchToProps,
  mergeProps,
  dispatch,
  { areStatesEqual, areOwnPropsEqual, areStatePropsEqual }
) {
  let hasRunAtLeastOnce = false
  let state
  let ownProps
  let stateProps
  let dispatchProps
  let mergedProps

  function handleFirstCall(firstState, firstOwnProps) {
    state = firstState
    ownProps = firstOwnProps
    // mapStateToProps ...
    // 这里实际上是在调用`wrapMapToProps -> wrapMapToPropsFunc`返回的`proxy`函数
    //调用proxy函数会返回props,最后把这些props给merged并返回。
    stateProps = mapStateToProps(state, ownProps)
    dispatchProps = mapDispatchToProps(dispatch, ownProps)
    mergedProps = mergeProps(stateProps, dispatchProps, ownProps)
    hasRunAtLeastOnce = true
    return mergedProps
  }

  function handleNewPropsAndNewState() {
    // 你可能好奇，为啥有的要dependsOnOwnProps.
    // 其实不管怎么样，他都会在proxy.mapToProps里判断
    // 因为state和props都有改变，所以直接mapStateToProps

    // 有一点比较好奇，这个是根据ownProps判断dependsOnOwnProps.看文档
    // https://react-redux.js.org/api/connect#the-arity-of-maptoprops-functions
    // mapStateToProps = (state, ownProps = {}) => {} 这样的ownProps是不会作为第二个参数。表示很奇怪。
    // 看此Issue查看 https://github.com/xiaohesong/react-redux/issues/1
    
    stateProps = mapStateToProps(state, ownProps)

    // 而且下面这个其实可以也不用判断，因为在方法里有判断
    // const proxy = function mapToPropsProxy(stateOrDispatch, ownProps) {
    // return proxy.dependsOnOwnProps ?
    //   proxy.mapToProps(stateOrDispatch, ownProps) :
    //   proxy.mapToProps(stateOrDispatch)
    // }
    
    // 为了直接点，
    // 下面为什么判断呢，因为props改变了
    // 如果依赖props，那么改变了就需要重新传参
    if (mapDispatchToProps.dependsOnOwnProps)
      dispatchProps = mapDispatchToProps(dispatch, ownProps)

    mergedProps = mergeProps(stateProps, dispatchProps, ownProps)
    return mergedProps
  }

  function handleNewProps() {
    //下面为什么判断呢，因为props改变了
    // 如果依赖props，那么改变了就需要重新传参
    if (mapStateToProps.dependsOnOwnProps)
      stateProps = mapStateToProps(state, ownProps)

    // 这个也是同样的道理
    if (mapDispatchToProps.dependsOnOwnProps)
      dispatchProps = mapDispatchToProps(dispatch, ownProps)

    mergedProps = mergeProps(stateProps, dispatchProps, ownProps)
    return mergedProps
  }

  function handleNewState() {
    //状态改变了，props没有改变，为什么要获取stateProps呢
    // 为了判断state改变是否影响到了前一个，如果影响了就返回新的mergedProps,否则就返回之前的，不进行更新。
    const nextStateProps = mapStateToProps(state, ownProps)
    const statePropsChanged = !areStatePropsEqual(nextStateProps, stateProps)
    stateProps = nextStateProps

    //到这里就说明props没有改变，如果stateprops改变了，那是需要重新mergeProps
    if (statePropsChanged)
      mergedProps = mergeProps(stateProps, dispatchProps, ownProps)

    return mergedProps
  }

  // 下面是二次调用的时候的一些步骤
  function handleSubsequentCalls(nextState, nextOwnProps) {
    // 浅比较, 默认都是shallowEqual的对比，但是存在用户定义的情况。
    const propsChanged = !areOwnPropsEqual(nextOwnProps, ownProps)
    const stateChanged = !areStatesEqual(nextState, state)
    state = nextState
    ownProps = nextOwnProps

    // 下面根据情况来了
    //都改变，那就处理新的state和props，并返回
    if (propsChanged && stateChanged) return handleNewPropsAndNewState()
    if (propsChanged) return handleNewProps()
    if (stateChanged) return handleNewState()
    return mergedProps
  }

  // hasRunAtLeastOnce是初始化和更新的区别
  return function pureFinalPropsSelector(nextState, nextOwnProps) {
    return hasRunAtLeastOnce
      ? handleSubsequentCalls(nextState, nextOwnProps)
      : handleFirstCall(nextState, nextOwnProps)
  }
}

// TODO: Add more comments

// If pure is true, the selector returned by selectorFactory will memoize its results,
// allowing connectAdvanced's shouldComponentUpdate to return false if final
// props have not changed. If false, the selector will always return a new
// object and shouldComponentUpdate will always return true.

//dispatch 是被包裹的最终的自用的组件

export default function finalPropsSelectorFactory(dispatch, {
  initMapStateToProps,
  initMapDispatchToProps,
  initMergeProps,
  ...options
}) {
  // 下面的这个调用是在闭包的返回基础上调用，见`connect.js`的`createConnect`方法里
  // 下面的这个initMapStateToProps是相当于运行的闭包，即`wrapMapToProps`里的`initProxySelector`.
  // 但是这几乎等于没有运行，因为这里直接返回了proxy.
  const mapStateToProps = initMapStateToProps(dispatch, options) // return proxy
  const mapDispatchToProps = initMapDispatchToProps(dispatch, options)
  const mergeProps = initMergeProps(dispatch, options)

  if (process.env.NODE_ENV !== 'production') {
    verifySubselectors(mapStateToProps, mapDispatchToProps, mergeProps, options.displayName)
  }

  //根据pure(用户传递的参数，默认是true)判断
  const selectorFactory = options.pure

    //根据hasRunAtLeastOnce来判断是不是第一次渲染，第一次渲染等同于impure...方法
    // 不是第一次渲染，就会判断到底是哪个改变，直接返回
    ? pureFinalPropsSelectorFactory 
    : impureFinalPropsSelectorFactory //此方法直接返回所有map的props merge起来返回

  // 上面返回了mapToProps之后，实则是返回了proxy.
  return selectorFactory(
    mapStateToProps,
    mapDispatchToProps,
    mergeProps,
    dispatch,
    options
  )
}
