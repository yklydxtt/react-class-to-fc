export default class File {
  ast: any = {}
  opts: {}
  code: string
  input: string
  output: string
  import: string[]
  export: string[]
  constructor(options: {}, { code, ast, input, output }) {
    this.opts = options
    this.code = code
    this.ast = ast
    this.input = input
    this.output = output
  }
}
