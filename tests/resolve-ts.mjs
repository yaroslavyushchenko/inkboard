// Lets `node --test` load the app's TypeScript modules, which import each other without a file
// extension (`./graph`), as the bundler allows. Node's type stripping needs `./graph.ts`.
import { registerHooks } from 'node:module'

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context)
    } catch (err) {
      if (specifier.startsWith('.') && !/\.[cm]?[jt]s$/.test(specifier)) return nextResolve(`${specifier}.ts`, context)
      throw err
    }
  }
})
