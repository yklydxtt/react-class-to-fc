import fs from 'fs'
import path from 'path'
import { parse } from '@babel/parser'
import * as t from '@babel/types'
import traverse from '@babel/traverse'
import { initLifecycle, callHook } from './core'
import { isFn } from './utils'
import plugins from './plugins'

type NormalizedFile = {
  output: string
  content: string
  ast?: t.File | t.Program | null
}

class Transformer {
  inputPath: string
  outputPath: string
  ast?: t.File | t.Program | null
  content: string
  plugins: any[]
  constructor(input: string, { output, content, ast }: NormalizedFile) {
    this.inputPath = input
    this.outputPath = output
    this.ast = ast
    this.content = content
    this.plugins = [...plugins]
  }

  walkAst = () => {
    const traverseOptions = {}
    traverse(this.ast, traverseOptions)
  }
}

function initPlugin(vm) {
  ;[].concat(vm.plugins).forEach((fn) => isFn(fn) && fn(vm._lifecycle, vm))
}

export const transform = async (option: any) => {
  const inputPath = path.join(process.cwd(), option.input || 'index.jsx')
  const content = fs.readFileSync(inputPath, 'utf-8')

  const ast = parse(content, {
    sourceType: 'module',
    plugins: ['jsx', 'decorators-legacy']
  })

  const transformer = new Transformer(inputPath, { output: '', content, ast })
  initLifecycle(transformer)
  initPlugin(transformer)
  callHook(transformer, 'init')
}
