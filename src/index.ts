import { DisconnectReason, fetchLatestWaWebVersion, makeCacheableSignalKeyStore, makeWASocket, useMultiFileAuthState } from '@whiskeysockets/baileys'
import P from 'pino'
import qrcode from 'qrcode-terminal'
import * as z from 'zod/v4'
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server'
import { serveStdio } from '@modelcontextprotocol/server/stdio'
import { toNodeHandler } from '@modelcontextprotocol/node'
import express from 'express'

const AUTH_DIR = process.env.WHATSAPP_AUTH_DIR ?? './local-data/whatsapp'
const PORT = Number(process.env.PORT ?? 3000)
const MCP_PATH = normalizePath(process.env.MCP_PATH ?? '/mcp')
const TRANSPORT = process.env.MCP_TRANSPORT ?? 'http'

const logger = P({
  level: process.env.LOG_LEVEL ?? 'silent',
})

let sock: ReturnType<typeof makeWASocket> | null = null
let connected = false
let starting = false

function normalizePath(path: string): string {
  const value = path.trim()
  if (!value) return '/mcp'
  return value.startsWith('/') ? value : `/${value}`
}

function normalizePhoneNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 8 || digits.length > 15) {
    throw new Error('Invalid phone number. Use an international number, e.g. 919876543210.')
  }
  return digits
}

async function startWhatsApp(): Promise<void> {
  if (starting || connected) return
  starting = true

  try {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR)
    const { version } = await fetchLatestWaWebVersion()

    sock = makeWASocket({
      version,
      browser: ['Chrome', 'Chrome', '1.0.0'],
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      logger,
      printQRInTerminal: false,
      markOnlineOnConnect: false,
    })

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
      if (qr) {
        console.error('\nScan this QR code with WhatsApp → Linked devices:\n')
        qrcode.generate(qr, { small: true })
      }

      if (connection === 'open') {
        connected = true
        starting = false
        console.error('WhatsApp connected.')
      }

      if (connection === 'close') {
        connected = false
        starting = false

        const statusCode = (lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode
        const loggedOut = statusCode === DisconnectReason.loggedOut

        if (loggedOut) {
          console.error('WhatsApp logged out. Delete local-data/whatsapp and restart to pair again.')
          return
        }

        console.error(`WhatsApp connection closed (${statusCode ?? 'unknown'}). Reconnecting...`)
        setTimeout(() => void startWhatsApp(), 3000)
      }
    })
  } catch (error) {
    starting = false
    connected = false
    console.error('Failed to start WhatsApp:', error)
    throw error
  }
}

async function ensureConnected(): Promise<NonNullable<typeof sock>> {
  if (!sock || !connected) {
    await startWhatsApp()
  }

  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (sock && connected) return sock
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }

  throw new Error('WhatsApp is not connected yet. Check the server logs and try again.')
}

function buildMcpServer(): McpServer {
  const server = new McpServer({
    name: 'personal-whatsapp-mcp',
    version: '0.2.0',
  })

  server.registerTool(
    'send_message',
    {
      title: 'Send WhatsApp message',
      description: 'Send a text message to a WhatsApp phone number. Use international format without +, spaces, or punctuation, for example 919876543210.',
      inputSchema: z.object({
        phoneNumber: z.string().min(8).max(20),
        message: z.string().min(1).max(4096),
      }),
    },
    async ({ phoneNumber, message }) => {
      const whatsapp = await ensureConnected()
      const digits = normalizePhoneNumber(phoneNumber)
      const jid = `${digits}@s.whatsapp.net`

      const result = await whatsapp.onWhatsApp(jid)
      if (!result?.[0]?.exists) {
        return {
          isError: true,
          content: [{ type: 'text', text: `WhatsApp number ${digits} was not found.` }],
        }
      }

      const sent = await whatsapp.sendMessage(jid, { text: message })

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              phoneNumber: digits,
              messageId: sent?.key?.id ?? null,
              message,
            }),
          },
        ],
      }
    },
  )

  server.registerTool(
    'whatsapp_status',
    {
      title: 'WhatsApp connection status',
      description: 'Check whether the linked WhatsApp account is connected.',
      inputSchema: z.object({}),
    },
    async () => ({
      content: [{
        type: 'text',
        text: JSON.stringify({ connected }),
      }],
    }),
  )

  return server
}

await startWhatsApp()

if (TRANSPORT === 'stdio') {
  await serveStdio(() => buildMcpServer())
  console.error('Personal WhatsApp MCP server is running over stdio.')
} else {
  const app = express()
  app.use(express.json({ limit: '1mb' }))

  app.get('/health', (_req, res) => {
    res.json({
      ok: true,
      whatsappConnected: connected,
      mcpPath: MCP_PATH,
    })
  })

  const handler = createMcpHandler(() => buildMcpServer())
  const nodeHandler = toNodeHandler(handler)

  app.all(MCP_PATH, (req, res) => {
    void nodeHandler(req, res, req.body)
  })

  app.listen(PORT, '0.0.0.0', () => {
    console.error(`Personal WhatsApp MCP server listening on port ${PORT}.`)
    console.error(`MCP endpoint: ${MCP_PATH}`)
    console.error('Health endpoint: /health')
  })
}
