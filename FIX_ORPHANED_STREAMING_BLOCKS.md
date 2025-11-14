# Fix for Orphaned Streaming Blocks

## Problem

Two critical issues were identified:

1. **"text part 3 not found" error flooding the UI**: This error came from the AI provider API and was being rendered repeatedly as error blocks, making the UI unusable.

2. **App stuck in "Thinking" state after restart**: When the application was closed or crashed during message streaming, blocks remained in `STREAMING` or `PROCESSING` status. Upon restart, these blocks were loaded with their intermediate states intact, causing the UI to display perpetual "Thinking" indicators.

## Root Cause

The `loadTopicMessagesThunkV2` function loaded messages and blocks directly from storage without any cleanup logic to handle orphaned streaming states. This affected both:
- Regular chat messages (stored in IndexedDB via `DexieMessageDataSource`)
- Agent session messages (stored in backend via `AgentMessageDataSource`)

## Solution

### Implementation

Added a `cleanupOrphanedStreamingBlocks()` utility function in `src/renderer/src/store/thunk/messageThunk.v2.ts` that:

1. **Identifies orphaned blocks**: Detects blocks stuck in `STREAMING` or `PROCESSING` status
2. **Determines appropriate final status**: 
   - Sets to `SUCCESS` if the block has content
   - Sets to `ERROR` if the block is empty
3. **Updates message status**: Updates parent messages to reflect the cleaned block states
4. **Persists changes**: Writes the cleaned states back to the database

### Code Changes

**File**: `src/renderer/src/store/thunk/messageThunk.v2.ts`

- Added `cleanupOrphanedStreamingBlocks()` function (lines 17-91)
- Modified `loadTopicMessagesThunkV2()` to apply cleanup when loading messages (lines 125-148)
- Added imports for `AssistantMessageStatus` and `MessageBlockStatus`

### Benefits

1. **Automatic recovery**: App automatically recovers from interrupted streaming sessions
2. **No user intervention**: Users don't need to manually fix stuck states
3. **Data preservation**: Content that was received is preserved and marked as successful
4. **Comprehensive logging**: All cleanup operations are logged for debugging
5. **Works for all message types**: Applies to both regular chats and agent sessions

## Testing

The fix can be tested by:

1. Starting a conversation with an AI model
2. While the model is "thinking" or streaming, force-quit the application
3. Restart the application and navigate to the same conversation
4. **Expected**: The thinking block should be marked as complete (success or error based on content)
5. **Before fix**: The UI would show perpetual "Thinking (X seconds)" indicator

## Logging

When cleanup occurs, the following logs are emitted:

```
INFO [MessageThunkV2] Cleaned up orphaned thinking block {blockId} from streaming to success
INFO [MessageThunkV2] Updated message {messageId} status from processing to success
INFO [MessageThunkV2] Persisted cleanup of X orphaned blocks to database
```

## Future Considerations

### About the "text part 3 not found" Error

This error originates from the AI provider API and suggests an issue with multi-part message parsing. While this fix prevents the UI from getting stuck, the underlying API error should be investigated:

- Check if certain message formats trigger this error
- Consider adding retry logic or better error handling in the streaming pipeline
- Review the message preparation logic to ensure proper formatting

### Potential Enhancements

1. **Cleanup threshold**: Could add a time threshold (e.g., only cleanup blocks older than X minutes) to avoid cleaning up legitimate in-progress streams
2. **User notification**: Could notify users when cleanup occurs (e.g., "Recovered from interrupted session")
3. **Partial content recovery**: Could attempt to extract and preserve partial content from error responses

## Related Files

- `src/renderer/src/store/thunk/messageThunk.v2.ts` - Main fix implementation
- `src/renderer/src/services/db/DexieMessageDataSource.ts` - Local message storage
- `src/renderer/src/services/db/AgentMessageDataSource.ts` - Agent message storage
- `src/renderer/src/types/newMessage.ts` - Message and block type definitions
- `src/renderer/src/pages/home/Messages/Blocks/ThinkingBlock.tsx` - Thinking block UI component

