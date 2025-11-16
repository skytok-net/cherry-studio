/**
 * Aggregates langgraph.js modules for use inside the artifact sandbox runtime.
 */
import * as LangGraphWeb from '@langchain/langgraph/web'

const registry: Record<string, unknown> = {
  '@langchain/langgraph/web': LangGraphWeb
}

export type LangGraphRegistry = typeof registry
export default registry

