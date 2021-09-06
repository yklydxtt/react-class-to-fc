import traverse, { NodePath } from '@babel/traverse'
import * as t from '@babel/types'

const classDeclarePlugin = (hook, vm) => {
  hook.transform(function () {
    traverse(vm.ast, {
      ClassDeclaration(path: NodePath<t.ClassDeclaration>) {
        //   找到实例方法和生命周期
        const methodBodys: Array<t.FunctionDeclaration> = []
        path.traverse({
          ClassMethod(path: NodePath<t.ClassMethod>) {
            const node = path.node
            methodBodys.push(
              t.functionDeclaration(node.key, node.params, node.body)
            )
          }
        })
        path.replaceWith(
          t.functionDeclaration(
            path.node.id,
            [t.identifier('props')],
            t.blockStatement(methodBodys)
          )
        )
      }
    })
  })
}

export default classDeclarePlugin
