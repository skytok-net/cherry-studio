/**
 * Aggregates a curated set of langchain.js modules into a registry object that
 * we can safely expose inside the artifact sandbox runtime.
 */
import * as LangchainAgents from 'langchain/agents'
import * as LangchainAgentsFormatScratchpad from 'langchain/agents/format_scratchpad'
import * as LangchainAgentsLoad from 'langchain/agents/load'
import * as LangchainAgentsToolkits from 'langchain/agents/toolkits'
import * as LangchainChains from 'langchain/chains'
import * as LangchainChainsCombineDocuments from 'langchain/chains/combine_documents'
import * as LangchainChainsHistoryAware from 'langchain/chains/history_aware_retriever'
import * as LangchainChainsLoad from 'langchain/chains/load'
import * as LangchainChainsOpenAIFunctions from 'langchain/chains/openai_functions'
import * as LangchainChainsQueryConstructor from 'langchain/chains/query_constructor'
import * as LangchainChainsRetrieval from 'langchain/chains/retrieval'
import * as LangchainChainsSqlDb from 'langchain/chains/sql_db'
import * as LangchainDocument from 'langchain/document'
import * as LangchainLoad from 'langchain/load'
import * as LangchainMemory from 'langchain/memory'
import * as LangchainMemoryChat from 'langchain/memory/chat_memory'
import * as LangchainOutputParsers from 'langchain/output_parsers'
import * as LangchainTextSplitter from 'langchain/text_splitter'
import * as LangchainTools from 'langchain/tools'
import * as LangchainToolsRender from 'langchain/tools/render'
import * as LangchainToolsRetriever from 'langchain/tools/retriever'
import * as LangchainToolsSql from 'langchain/tools/sql'

const registry: Record<string, unknown> = {
  'langchain/load': LangchainLoad,
  'langchain/agents': LangchainAgents,
  'langchain/agents/load': LangchainAgentsLoad,
  'langchain/agents/toolkits': LangchainAgentsToolkits,
  'langchain/agents/format_scratchpad': LangchainAgentsFormatScratchpad,
  'langchain/chains': LangchainChains,
  'langchain/chains/load': LangchainChainsLoad,
  'langchain/chains/combine_documents': LangchainChainsCombineDocuments,
  'langchain/chains/openai_functions': LangchainChainsOpenAIFunctions,
  'langchain/chains/history_aware_retriever': LangchainChainsHistoryAware,
  'langchain/chains/query_constructor': LangchainChainsQueryConstructor,
  'langchain/chains/retrieval': LangchainChainsRetrieval,
  'langchain/chains/sql_db': LangchainChainsSqlDb,
  'langchain/memory': LangchainMemory,
  'langchain/memory/chat_memory': LangchainMemoryChat,
  'langchain/tools': LangchainTools,
  'langchain/tools/render': LangchainToolsRender,
  'langchain/tools/retriever': LangchainToolsRetriever,
  'langchain/tools/sql': LangchainToolsSql,
  'langchain/text_splitter': LangchainTextSplitter,
  'langchain/document': LangchainDocument,
  'langchain/output_parsers': LangchainOutputParsers
}

export type LangchainRegistry = typeof registry
export default registry

