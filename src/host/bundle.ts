/**
 * dsh-plugin-chat-menu host half — bundle form (official profile channel).
 * ESM function plugin: named exports name / inject / apply. The
 * /chat-menu/list route rides the profile's webServer; the listing logic is
 * the shared core (src/core/host-core.ts).
 */
import { isTrustedRequest, list, type Ctx } from '../core/host-core'

/** Plugin identity for cordis.yml rows. */
export const name = 'dsh-plugin-chat-menu'

/** Services required before mounting: the webserver route registry, the session store, and the filesystem provider. */
export const inject = ['webServer', 'sessions', 'fs']

/** Mount the /chat-menu/list route (a fiber effect, removed on plugin stop). */
export function apply(ctx: Ctx): void {
  const writeJson = (res: { writeHead(status: number, headers: Record<string, string>): void; end(body: string): void }, status: number, body: unknown): void => {
    res.writeHead(status, { 'content-type': 'application/json' })
    res.end(JSON.stringify(body))
  }

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/chat-menu/list',
    handler: async (req, res) => {
      if (!isTrustedRequest(req as { headers: Record<string, string | string[] | undefined>; url?: string })) {
        writeJson(res as never, 403, { error: 'forbidden' })
        return
      }
      try {
        const url = new URL((req as { url?: string }).url ?? '/', 'http://localhost')
        const sessionId = url.searchParams.get('sessionId') ?? ''
        const path = url.searchParams.get('path') ?? ''
        const filter = url.searchParams.get('filter') ?? ''
        writeJson(res as never, 200, await list(ctx, sessionId, path, filter))
      } catch (error) {
        writeJson(res as never, 500, { error: 'list-failed', message: error instanceof Error ? error.message : String(error) })
      }
    },
  }), 'chat-menu: /chat-menu/list route')
}
