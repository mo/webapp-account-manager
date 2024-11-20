const consoleLog = (...args) => {
  // deno-lint-ignore no-console
  console.log(...args)
}

const consoleError = (...args) => {
  // deno-lint-ignore no-console
  console.error(...args)
}

export { consoleError, consoleLog }
