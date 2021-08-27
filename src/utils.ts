import chalk from 'chalk'

export function log(msg: string, type: string = 'error') {
  if (type === 'error') {
    return console.log(chalk.red(`[vue-to-react]: ${msg}`))
  }
  console.log(chalk.green(msg))
}
