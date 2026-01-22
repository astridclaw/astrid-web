import type { NextApiRequest, NextApiResponse } from "next"
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js"
import AstridMCPServerOAuth from "../../../mcp/mcp-server-oauth"
import { extractAuthContext } from "../../../lib/server/mcp-http-utils"
import { deleteSession, storeSession } from "../../../lib/server/mcp-session-store"

export const config = {
  api: {
    bodyParser: false,
  },
}

const ENABLE_DNS_PROTECTION = process.env.ASTRID_MCP_ENABLE_DNS_PROTECTION === "true"
const ALLOWED_HOSTS = (process.env.ASTRID_MCP_ALLOWED_HOSTS || "")
  .split(",")
  .map(value => value.trim())
  .filter(Boolean)
const ALLOWED_ORIGINS = (process.env.ASTRID_MCP_ALLOWED_ORIGINS || "")
  .split(",")
  .map(value => value.trim())
  .filter(Boolean)

const securityOptions =
  ENABLE_DNS_PROTECTION || ALLOWED_HOSTS.length || ALLOWED_ORIGINS.length
    ? {
        enableDnsRebindingProtection: ENABLE_DNS_PROTECTION,
        allowedHosts: ALLOWED_HOSTS.length ? ALLOWED_HOSTS : undefined,
        allowedOrigins: ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS : undefined,
      }
    : undefined

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "OPTIONS") {
    res.setHeader("Allow", "GET,OPTIONS")
    res.status(200).end()
    return
  }

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET,OPTIONS")
    res.status(405).json({ error: "Method Not Allowed" })
    return
  }

  const authContext = extractAuthContext(req)
  if (!authContext) {
    res.status(401).json({
      error:
        "Provide Authorization: Bearer <astrid_access_token> or Basic <base64(clientId:secret)> (or X-Astrid-* headers)",
    })
    return
  }

  try {
    const transport = new SSEServerTransport(
      process.env.ASTRID_MCP_POST_PATH || "/mcp/messages",
      res as any,
      securityOptions
    )
    const sessionId = transport.sessionId
    const serverInstance = new AstridMCPServerOAuth(authContext.options)

    storeSession(sessionId, {
      transport,
      server: serverInstance,
      authSignature: authContext.authSignature,
      createdAt: Date.now(),
    })

    transport.onclose = () => {
      deleteSession(sessionId)
    }

    await serverInstance.startWithTransport(transport, "sse")
    console.log(
      `[MCP] SSE session established (${sessionId}) for base ${authContext.options.baseUrl || "https://astrid.cc"}`
    )
  } catch (error) {
    console.error("[MCP] Failed to establish SSE session:", error)
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to establish MCP session" })
    }
  }
}
