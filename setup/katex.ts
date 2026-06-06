import { katexMacros } from './macros'

// https://sli.dev/custom/config-katex.html
export default function setup() {
  return {
    macros: katexMacros,
  }
}
