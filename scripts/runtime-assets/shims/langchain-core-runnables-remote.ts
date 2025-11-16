/**
 * Stub module used to satisfy langchain's dependency on
 * `@langchain/core/runnables/remote` when bundling for the sandbox runtime.
 */
export const RemoteRunnableNotSupported = () => {
  throw new Error('Remote LangChain runnables are not supported inside the artifact sandbox.')
}

export default {}

