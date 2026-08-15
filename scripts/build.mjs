/**
 * Build lib/ from src/:
 *   - lib/index.js           host half (ESM) — src/host.js verbatim
 *   - lib/client.js          browser bundle — src/client.js with __CLIENT_ID__
 *                            replaced by the official package-name id
 *   - lib/client-registry.js browser bundle — same source, manifest id
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFile(join(root, p), 'utf8')

await mkdir(join(root, 'lib'), { recursive: true })

await writeFile(join(root, 'lib/index.js'), await read('src/host.js'))

const clientSource = await read('src/client.js')
for (const [file, id] of [
  ['lib/client.js', 'dsh-plugin-chat-menu'],
  ['lib/client-registry.js', 'dsh-external/dsh-plugin-chat-menu'],
]) {
  await writeFile(join(root, file), clientSource.replaceAll('__CLIENT_ID__', JSON.stringify(id)))
}

console.log('built lib/index.js, lib/client.js, lib/client-registry.js')
