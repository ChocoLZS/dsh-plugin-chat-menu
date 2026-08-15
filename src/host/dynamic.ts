/**
 * dsh-plugin-chat-menu host half — dynamic form (cordis_define function body).
 * Bridged with harness.handle to the SAME shared listing core as the bundle
 * form; only the transport channel differs. `harness` is a closure symbol in
 * the dynamic sandbox (free variable; declared here for typecheck only).
 */
import { list, type Ctx } from '../core/host-core'

declare const harness: {
  handle(method: string, handler: (args: unknown) => unknown): () => void
}

/** Plugin identity. */
export const name = 'dsh-plugin-chat-menu'

/** Mount the fsmenu/list RPC (the dynamic runner owns harness-handler cleanup). */
export function apply(ctx: Ctx): void {
  harness.handle('fsmenu/list', async (args: unknown) => {
    const value = args !== null && typeof args === 'object' ? args as Record<string, unknown> : {}
    const sessionId = typeof value.sessionId === 'string' ? value.sessionId : ''
    const path = typeof value.path === 'string' ? value.path : ''
    const filter = typeof value.filter === 'string' ? value.filter : ''
    try {
      return await list(ctx, sessionId, path, filter)
    } catch (error) {
      return { error: 'list-failed', message: error instanceof Error ? error.message : String(error) }
    }
  })
}
