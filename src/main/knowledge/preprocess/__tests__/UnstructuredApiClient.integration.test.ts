/**
 * Integration test for Unstructured.io API
 *
 * This test validates the correct way to send files to the Unstructured.io API
 * using Node.js's form-data package.
 *
 * To run this test:
 * 1. Set your UNSTRUCTURED_API_KEY environment variable
 * 2. Ensure you have a test PDF at: docs/unstructured/Updates-with-Greg-Spray-9f435501-0217.pdf
 * 3. Run: UNSTRUCTURED_API_KEY=your_key yarn test:main --run src/main/knowledge/preprocess/__tests__/UnstructuredApiClient.integration.test.ts
 *
 * @requires UNSTRUCTURED_API_KEY environment variable
 */

import axios from 'axios'
import FormDataNode from 'form-data'
import { readFileSync } from 'fs'
import { join } from 'path'
import { beforeAll, describe, expect, it, vi } from 'vitest'

// Unmock fs module for this integration test - we need real file system access
vi.unmock('node:fs')
vi.unmock('fs')

const API_KEY = process.env.UNSTRUCTURED_API_KEY
const BASE_URL = 'https://api.unstructuredapp.io'
// Get test PDF path from environment variable or use default
const TEST_PDF_PATH =
  process.env.TEST_PDF_PATH || join(process.cwd(), 'docs/unstructured/Updates-with-Greg-Spray-9f435501-0217.pdf')

// Skip this test suite if no API key is provided
const describeIf = API_KEY ? describe : describe.skip

// Debug: Print configuration at module level
if (API_KEY) {
  console.log('\n🔧 Unstructured.io Integration Test Configuration:')
  console.log('  API Key: ✓ Set')
  console.log('  Test PDF:', TEST_PDF_PATH)
}

describeIf('Unstructured.io API Integration', () => {
  let testFileBuffer: Buffer

  beforeAll(() => {
    // Load test file (will throw if file doesn't exist)
    try {
      testFileBuffer = readFileSync(TEST_PDF_PATH)
      console.log(`✓ Loaded test PDF: ${testFileBuffer.length} bytes from ${TEST_PDF_PATH}`)
    } catch (error) {
      throw new Error(`Test PDF file not found or unreadable at: ${TEST_PDF_PATH}\nError: ${error}`)
    }
  })

  it('should successfully process a PDF file using form-data package', async () => {
    // Create FormData using Node.js form-data package
    const formData = new FormDataNode()

    // Append file with proper metadata
    formData.append('files', testFileBuffer, {
      filename: 'Updates-with-Greg-Spray-9f435501-0217.pdf',
      contentType: 'application/pdf'
    })

    // Add processing parameters
    formData.append('strategy', 'fast')
    formData.append('chunking_strategy', 'by_title')
    formData.append('output_format', 'application/json')

    // Make the API request
    const response = await axios.post(`${BASE_URL}/general/v0/general`, formData, {
      headers: {
        'unstructured-api-key': API_KEY,
        ...formData.getHeaders() // Critical: includes Content-Type with boundary
      },
      timeout: 60000 // 60 second timeout
    })

    // Validate response
    expect(response.status).toBe(200)
    expect(Array.isArray(response.data)).toBe(true)
    expect(response.data.length).toBeGreaterThan(0)

    // Validate element structure
    const firstElement = response.data[0]
    expect(firstElement).toHaveProperty('type')
    expect(firstElement).toHaveProperty('text')
    expect(firstElement.text).toBeTruthy()

    console.log(`✓ Successfully processed PDF: ${response.data.length} elements extracted`)
    console.log(`  First element type: ${firstElement.type}`)
    console.log(`  First element text (truncated): ${firstElement.text.substring(0, 100)}...`)
  }, 120000) // 2 minute timeout for the test

  it('should validate API endpoint is accessible', async () => {
    const response = await axios.get(`${BASE_URL}/general/v0/general/docs`, {
      headers: {
        'unstructured-api-key': API_KEY
      },
      timeout: 10000
    })

    expect(response.status).toBe(200)
    console.log('✓ API endpoint is accessible')
  })

  it('should handle authentication correctly', async () => {
    // Test with invalid API key
    const formData = new FormDataNode()
    formData.append('files', testFileBuffer, {
      filename: 'test.pdf',
      contentType: 'application/pdf'
    })
    formData.append('strategy', 'fast')

    await expect(
      axios.post(`${BASE_URL}/general/v0/general`, formData, {
        headers: {
          'unstructured-api-key': 'invalid-key',
          ...formData.getHeaders()
        },
        timeout: 10000
      })
    ).rejects.toThrow()

    console.log('✓ Authentication validation works correctly')
  })

  it('should test with minimal parameters', async () => {
    const formData = new FormDataNode()

    // Minimal required parameters
    formData.append('files', testFileBuffer, {
      filename: 'test.pdf',
      contentType: 'application/pdf'
    })

    const response = await axios.post(`${BASE_URL}/general/v0/general`, formData, {
      headers: {
        'unstructured-api-key': API_KEY,
        ...formData.getHeaders()
      },
      timeout: 60000
    })

    expect(response.status).toBe(200)
    expect(Array.isArray(response.data)).toBe(true)
    console.log('✓ Minimal parameters work correctly')
  }, 120000)

  it('should validate FormData headers include boundary', () => {
    const formData = new FormDataNode()
    formData.append('test', 'value')

    const headers = formData.getHeaders()
    expect(headers).toHaveProperty('content-type')
    expect(headers['content-type']).toContain('multipart/form-data')
    expect(headers['content-type']).toContain('boundary=')

    console.log(`✓ FormData headers: ${headers['content-type']}`)
  })
})

// If no API key, show helpful message
if (!API_KEY) {
  console.log('\n⚠️  Skipping Unstructured.io integration tests (no API key)')
  console.log('   Set UNSTRUCTURED_API_KEY environment variable to run these tests\n')
}
