# Mistral Embedding Implementation Plan

## Problem Analysis

Cherry Studio is experiencing 422 embedding failures when using Mistral AI's embedding API. The root cause is that the current implementation uses OpenAI's embedding class for all providers, including Mistral, but Mistral has different API requirements.

## Research Findings

### Mistral API Specifications
- **Endpoint**: `https://api.mistral.ai/v1/embeddings`
- **Primary Model**: `mistral-embed` (default, 1024 dimensions)
- **Code Model**: `codestral-embed` (for code, up to 3072 dimensions)
- **Request Format**: OpenAI-compatible with Mistral-specific extensions

### Key API Differences
1. **Parameter Names**:
   - Supports both `input` and `inputs` (array preferred)
   - Additional `output_dimension` parameter (1024 default, max 3072)
   - Additional `output_dtype` parameter (`float`, `int8`, `binary`, `uint8`)

2. **Request Structure**:
   ```json
   {
     "model": "mistral-embed",
     "inputs": ["text1", "text2"],
     "output_dimension": 1024,
     "output_dtype": "float"
   }
   ```

3. **Response Format**: OpenAI-compatible
   ```json
   {
     "data": [
       {
         "embedding": [0.1, 0.2, ...],
         "index": 0,
         "object": "embedding"
       }
     ],
     "model": "mistral-embed",
     "object": "list",
     "usage": {
       "prompt_tokens": 15,
       "total_tokens": 15
     }
   }
   ```

## Implementation Strategy

### Phase 1: Create MistralEmbeddings Class
Create `src/main/knowledge/embedjs/embeddings/MistralEmbeddings.ts`:
- Implement BaseEmbeddings interface
- Use native fetch with proper Mistral API format
- Handle Mistral-specific parameters
- Provide detailed error handling for 422 responses

### Phase 2: Update EmbeddingsFactory
Modify `src/main/knowledge/embedjs/embeddings/EmbeddingsFactory.ts`:
- Add Mistral provider detection
- Use MistralEmbeddings for Mistral provider
- Maintain backward compatibility
- Add comprehensive logging

### Phase 3: Add Circuit Breaker
Enhance `src/renderer/src/queue/KnowledgeQueue.ts`:
- Track consecutive embedding failures
- Stop processing after 3 consecutive failures
- Provide clear error messages
- Allow manual retry mechanism

### Phase 4: Fix Provider Registration
Update `src/renderer/src/aiCore/provider/providerInitialization.ts`:
- Add registration state tracking
- Prevent duplicate provider registration
- Reduce console noise from override warnings

## Expected Outcomes

1. **422 Embedding Failures**: Should be eliminated for Mistral provider
2. **404 Knowledge Base Creation**: Should be resolved with proper embedding support
3. **Provider Override Warnings**: Should be reduced significantly
4. **Queue Processing**: Should stop gracefully on consecutive failures
5. **Error Messages**: Should be more informative and actionable

## Implementation Files

### New Files to Create:
- `src/main/knowledge/embedjs/embeddings/MistralEmbeddings.ts`

### Files to Modify:
- `src/main/knowledge/embedjs/embeddings/EmbeddingsFactory.ts`
- `src/renderer/src/queue/KnowledgeQueue.ts`
- `src/renderer/src/aiCore/provider/providerInitialization.ts`

## Testing Strategy

1. **Unit Tests**: Test MistralEmbeddings class with mock API responses
2. **Integration Tests**: Test with actual Mistral API (if API key available)
3. **Error Handling**: Test 422 error scenarios and circuit breaker
4. **Regression Tests**: Ensure other providers (OpenAI, Ollama) still work

## Rollback Plan

If issues arise:
1. Revert EmbeddingsFactory changes to use OpenAI for all providers
2. Add temporary provider blacklist for Mistral
3. Provide user guidance for switching to OpenAI-compatible providers

## Success Metrics

- Zero 422 embedding failures for Mistral provider
- Successful knowledge base creation with Mistral models
- Reduced error noise in console logs
- Improved user experience with better error messages
