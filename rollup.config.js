import { nodeResolve } from '@rollup/plugin-node-resolve';

export default {
  input: 'node_modules/age-encryption/dist/index.js',
  output: {
    file: 'age-bundle.js',
    // The extension loads page.js as an ES module and imports named exports
    // from './age-bundle.js'. Therefore this bundle must also be an ES module.
    // If we emit an IIFE, the browser will treat it as a module (because it's
    // imported) but it won't have any `export ...` statements, leading to:
    //   "doesn't provide an export named 'armor'"
    format: 'es'
  },
  plugins: [nodeResolve()]
};