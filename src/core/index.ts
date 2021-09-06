export function initLifecycle(vm) {
  const hooks = ['init', 'beforeTraverse']
  vm._hooks = {}
  vm._lifecycle = {}
  hooks.forEach((hook) => {
    const arr = (vm._hooks[hook] = [])
    vm._lifecycle[hook] = (fn: () => void) => arr.push(fn)
  })
}

export function callHook(
  vm,
  hookName: string,
  data?: any,
  next = (data: any) => {}
) {
  const queue = vm._hooks[hookName]

  const step = function (index: number) {
    const hookFn = queue[index]
    if (index >= queue.length) {
      next(data)
    } else if (typeof hookFn === 'function') {
      if (hookFn.length === 2) {
        hookFn(data, (result) => {
          data = result
          step(index + 1)
        })
      } else {
        const result = hookFn(data)
        data = result === undefined ? data : result
        step(index + 1)
      }
    } else {
      step(index + 1)
    }
  }
  step(0)
}
