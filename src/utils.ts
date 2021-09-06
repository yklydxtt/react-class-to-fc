import chalk from 'chalk'

export function log(msg: string, type: string = 'error') {
  if (type === 'error') {
    return console.log(chalk.red(`[vue-to-react]: ${msg}`))
  }
  console.log(chalk.green(msg))
}

/**
 * Check if value is function
 * @param {*} obj Any javascript object
 * @returns {Boolean} True if the passed-in value is a function
 */
export function isFn(obj: any) {
  return typeof obj === 'function'
}
