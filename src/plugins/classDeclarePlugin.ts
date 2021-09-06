import traverse from '@babel/traverse'
import * as t from '@babel/types'

const classDeclarePlugin = (hook, vm) => {
  hook.init(function () {
    traverse(vm.ast, {
      ClassDeclaration(path) {
        path.replaceWith(
          t.functionDeclaration(path.node.id, [t.identifier('props')])
        )
      }
    })
  })
}

export default classDeclarePlugin
