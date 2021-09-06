import fs from 'fs'
import path from 'path'
import { parse } from '@babel/parser'
import * as t from '@babel/types'
import traverse from '@babel/traverse'
import generate from '@babel/generator'
import { initLifecycle, callHook } from './core'
import { isFn, log } from './utils'
import { classDeclarePlugin, getClassMethodPlugin } from './plugins'

type NormalizedFile = {
  output: string
  content: string
  ast?: t.File | t.Program | null
  plugins?: any[]
}

class Transformer {
  inputPath: string
  outputPath: string
  ast?: t.File | t.Program | null
  content: string
  plugins?: any[]
  code: string
  constructor(
    input: string,
    { output, content, ast, plugins = [] }: NormalizedFile
  ) {
    this.inputPath = input
    const [name, ext] = input.split('.')
    this.outputPath = path.join(output || `${name}.fc.${ext}`)
    this.ast = ast
    this.content = content
    this.plugins = [getClassMethodPlugin, classDeclarePlugin, ...plugins]
  }

  walkAst = () => {
    const traverseOptions = {}
    traverse(this.ast, traverseOptions)
  }

  genCode = () => {
    const { code } = generate(this.ast, {
      quotes: 'single'
    })
    this.code = code
  }

  output = () => {
    fs.writeFileSync(this.outputPath, this.code)
    log(`${path.basename(this.outputPath)}文件生成成功！`, 'success')
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
  callHook(transformer, 'beforeTransform')
  callHook(transformer, 'transform')
  callHook(transformer, 'afterTransform')
  transformer.genCode()
  transformer.output()
}
