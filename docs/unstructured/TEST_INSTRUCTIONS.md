# Unstructured.io Integration Testing Instructions

## What We Fixed

1. **Incorrect API Base URL**: Changed from `api.unstructured.io` to `api.unstructuredapp.io`
2. **Incorrect Endpoint Path**: Changed from `/general/v0/partition` to `/general/v0/general`
3. **FormData Implementation**: Switched from browser `Blob` API to Node.js `form-data` package
4. **Missing Dependencies**: Added `form-data` and `@types/form-data` packages

## Changes Made

### 1. UnstructuredPreprocessProvider.ts (Line 27)
```typescript
apiEndpoint: provider.apiHost || 'https://api.unstructuredapp.io'
```

### 2. UnstructuredApiClient.ts

**Line 5** - Import form-data package:
```typescript
import FormDataNode from 'form-data'
```

**Lines 76-82** - Fixed file attachment:
```typescript
const formData = new FormDataNode()
const mimeType = this.getMimeType(fileName)
formData.append('files', fileBuffer, {
  filename: fileName,
  contentType: mimeType
})
```

**Lines 112-116** - Updated endpoint and headers:
```typescript
const response = await this.httpClient.post('/general/v0/general', formData, {
  headers: {
    ...formData.getHeaders()  // Critical: includes Content-Type with boundary
  }
})
```

**Line 359** - Updated connection test endpoint:
```typescript
const response = await this.httpClient.get('/general/v0/general/docs')
```

### 3. Package Dependencies
Added to package.json:
- `form-data`: For Node.js multipart/form-data handling
- `@types/form-data`: TypeScript type definitions

## How to Test

### Prerequisites
1. Get an Unstructured.io API key from https://unstructured.io/
2. Ensure test PDF exists at: `docs/unstructured/Updates-with-Greg-Spray-9f435501-0217.pdf`

### Option 1: Run Integration Test (Recommended)

This test validates the API integration without running the full application:

```bash
# Set your API key
export UNSTRUCTURED_API_KEY=your_api_key_here

# Run the integration test
yarn test:main --run src/main/knowledge/preprocess/__tests__/UnstructuredApiClient.integration.test.ts
```

Expected output:
```
✓ should successfully process a PDF file using form-data package
  Successfully processed PDF: X elements extracted
✓ should validate API endpoint is accessible
✓ should handle authentication correctly
✓ should test with minimal parameters
✓ should validate FormData headers include boundary
```

### Option 2: Test in Application

1. **Configure Unstructured.io Provider**:
   - Open Cherry Studio
   - Go to Settings → Knowledge Base → Document Processing
   - Select "Unstructured.io"
   - Enter your API key
   - Save settings

2. **Create Knowledge Base**:
   - Click "Add Knowledge Base"
   - Name: "Test Knowledge Base"
   - Document Processing: Unstructured.io
   - Select embedding model
   - Click OK

3. **Upload Test Document**:
   - Open the knowledge base
   - Upload: `docs/unstructured/Updates-with-Greg-Spray-9f435501-0217.pdf`
   - Wait for processing to complete

4. **Expected Result**:
   - Status should change from "Processing" to "Completed"
   - No error messages in console
   - Document chunks appear in knowledge base

## Troubleshooting

### 422 Error: "Unsupported file format or corrupted file"
- **Cause**: FormData boundary not being set correctly
- **Fix**: Ensure `formData.getHeaders()` is called (already implemented)

### 404 Error: "Page not found"
- **Cause**: Wrong API endpoint
- **Fix**: Use `/general/v0/general` not `/general/v0/partition`

### 401 Error: "Invalid API key"
- **Cause**: API key not set or incorrect
- **Fix**: Verify your API key at https://unstructured.io/

### Network Timeout
- **Cause**: Large file or slow processing
- **Fix**: Increase timeout in config (already set to 120 seconds)

## Key Technical Insights

### Why form-data Package?

The browser's `FormData` API doesn't work in Node.js/Electron main process. The `form-data` npm package:
1. Properly creates multipart/form-data streams
2. Generates correct Content-Type header with boundary
3. Handles file buffers correctly in Node.js

### Critical Implementation Detail

The `formData.getHeaders()` call is **essential**:

```typescript
const response = await axios.post(url, formData, {
  headers: {
    ...formData.getHeaders()  // DON'T FORGET THIS!
  }
})
```

This adds the `Content-Type: multipart/form-data; boundary=---...` header that Unstructured.io needs to parse the file correctly.

## Test Coverage

The integration test validates:
1. ✅ Successful PDF processing with full parameters
2. ✅ API endpoint accessibility
3. ✅ Authentication handling
4. ✅ Minimal parameter set
5. ✅ FormData header generation

## Next Steps

If the integration test passes:
1. ✅ The core API integration is working
2. ✅ FormData implementation is correct
3. ✅ All necessary headers are being sent
4. ✅ The application should now work with Unstructured.io

If it fails, check:
- API key is valid and active
- Test PDF file exists
- Network connectivity
- Console output for detailed error messages
