import { mkdir, rm, writeFile, copyFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import https from 'node:https'

import { build } from 'esbuild'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')
const outputDir = path.resolve(
  projectRoot,
  'src/renderer/src/components/CodeBlockView/runtimeAssets/generated'
)

const ensureDir = async () => {
  await rm(outputDir, { recursive: true, force: true })
  await mkdir(outputDir, { recursive: true })
}

const copyTargets = [
  {
    from: path.resolve(projectRoot, 'node_modules/@xyflow/react/dist/umd/index.js'),
    to: path.join(outputDir, 'reactflow.umd.js')
  },
  {
    from: path.resolve(projectRoot, 'node_modules/@xyflow/react/dist/style.css'),
    to: path.join(outputDir, 'reactflow.css')
  },
  {
    from: path.resolve(projectRoot, 'node_modules/@xyflow/react/dist/base.css'),
    to: path.join(outputDir, 'reactflow-base.css')
  },
  {
    from: path.resolve(projectRoot, 'node_modules/lucide-react/dist/umd/lucide-react.min.js'),
    to: path.join(outputDir, 'lucide-react.min.js')
  },
  {
    from: path.resolve(projectRoot, 'node_modules/clsx/dist/clsx.min.js'),
    to: path.join(outputDir, 'clsx.min.js')
  }
]

const bundleTargets: Array<{
  entry: string
  outfile: string
  globalName: string
  define?: Record<string, string>
}> = [
  {
    entry: 'preact/compat',
    outfile: path.join(outputDir, 'preact-compat.js'),
    globalName: 'PreactCompatBundle'
  },
  {
    entry: 'solid-js/web',
    outfile: path.join(outputDir, 'solid-runtime.js'),
    globalName: 'SolidRuntimeBundle'
  },
  {
    entry: 'tailwind-merge',
    outfile: path.join(outputDir, 'tailwind-merge.js'),
    globalName: 'TailwindMergeBundle'
  },
  {
    entry: 'class-variance-authority',
    outfile: path.join(outputDir, 'class-variance-authority.js'),
    globalName: 'ClassVarianceAuthorityBundle'
  }
]

const downloadTargets: Array<{
  url: string
  outfile: string
  banner?: string
}> = [
  {
    url: 'https://cdn.tailwindcss.com?plugins=forms,typography,aspect-ratio,container-queries',
    outfile: path.join(outputDir, 'tailwind-cdn.js'),
    banner:
      '// TailwindCSS Play CDN bundle (downloaded for offline use)\n// Source: https://cdn.tailwindcss.com\n'
  },
  {
    url: 'https://unpkg.com/react@18/umd/react.development.js',
    outfile: path.join(outputDir, 'react.dev.bundle.js'),
    banner: '// React 18 UMD build (downloaded for ReactFlow compatibility)\n'
  },
  {
    url: 'https://unpkg.com/react-dom@18/umd/react-dom.development.js',
    outfile: path.join(outputDir, 'react-dom.dev.bundle.js'),
    banner: '// ReactDOM 18 UMD build (downloaded for ReactFlow compatibility)\n'
  }
]

async function copyStaticAssets() {
  await Promise.all(
    copyTargets.map(async ({ from, to }) => {
      await copyFile(from, to)
      console.log(`Copied ${path.relative(projectRoot, from)} -> ${path.relative(projectRoot, to)}`)
    })
  )
}

async function bundleAssets() {
  for (const target of bundleTargets) {
    await build({
      entryPoints: [target.entry],
      outfile: target.outfile,
      bundle: true,
      format: 'iife',
      globalName: target.globalName,
      platform: 'browser',
      target: ['es2019'],
      define: {
        'process.env.NODE_ENV': '"production"',
        ...(target.define ?? {})
      },
      logLevel: 'silent'
    })
    console.log(`Bundled ${target.entry} -> ${path.relative(projectRoot, target.outfile)}`)
  }
}

async function fetchRemoteBuffer(url: string): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const redirectedUrl = new URL(res.headers.location, url).toString()
          res.resume()
          fetchRemoteBuffer(redirectedUrl).then(resolve).catch(reject)
          return
        }
        if (res.statusCode !== 200) {
          reject(new Error(`Failed to download ${url} (status ${res.statusCode})`))
          res.resume()
          return
        }
        const chunks: Buffer[] = []
        res.on('data', (chunk) => chunks.push(chunk))
        res.on('end', () => resolve(Buffer.concat(chunks)))
      })
      .on('error', reject)
  })
}

async function downloadFile(url: string, destination: string, banner?: string) {
  const response = await fetchRemoteBuffer(url)
  const payload = banner ? `${banner}\n${response.toString('utf8')}` : response.toString('utf8')
  await writeFile(destination, payload, 'utf8')
  console.log(`Downloaded ${url} -> ${path.relative(projectRoot, destination)}`)
}

async function downloadAssets() {
  for (const target of downloadTargets) {
    await downloadFile(target.url, target.outfile, target.banner)
  }
}

async function main() {
  await ensureDir()
  await copyStaticAssets()
  await bundleAssets()
  await downloadAssets()
  console.log('Runtime assets built successfully.')
}

main().catch((error) => {
  console.error('[build-runtime-assets] Failed:', error)
  process.exitCode = 1
})

