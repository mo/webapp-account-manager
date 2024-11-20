import process from 'node:process'

const waitForKey = () =>
    new Promise((resolve) =>
        process.stdin.once('data', () => {
            process.stdin.pause()
            resolve()
        })
    )

export { waitForKey }
