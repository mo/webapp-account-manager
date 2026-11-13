const consoleLog = (...args) => {
  // oxlint-disable-next-line no-console
  console.log(...args)
}

const consoleError = (...args) => {
  // oxlint-disable-next-line no-console
  console.error(...args)
}

export { consoleError, consoleLog }
