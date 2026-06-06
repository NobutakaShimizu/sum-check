import katex from 'katex'
import { katexMacros } from '../setup/macros'

export function renderTex(tex: string, displayMode = false): string {
  try {
    return katex.renderToString(tex, {
      macros: katexMacros,
      displayMode,
      throwOnError: false,
    })
  }
  catch {
    return tex
  }
}
