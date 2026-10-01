import { DisconnectReason, fetchLatestWaWebVersion, makeCacheableSignalKeyStore, makeWASocket, useMultiFileAuthState } from '@whiskeysockets/baileys'
import P from 'pino'
import qrcode from 'qrcode-terminal'
import * as z from 'zod/v4'
import { McpServer } from '@modelcontextprotocol/server'
import { serveStdio } from '@modelcontextprotocol/server/stdio'

const AUTH_DIR = process.env.WHATSAPP_AUTH_DIR ?? './local-data/whatsapp'

const logger = P({
  level: process.env.LOG_LEVEL ?? 'silent',
})

let sock: ReturnType<typeof makeWASocket> | null = null
let connected = false
let starting = false

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

  if (!sock || !connected) {
    throw new Error('WhatsApp is not connected yet. Scan the QR code shown in the terminal and try again.')
  }

  return sock
}

const server = new McpServer({
  name: 'personal-whatsapp-mcp',
  version: '0.1.0',
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

await startWhatsApp()
await serveStdio(() => server)
console.error('Personal WhatsApp MCP server is running.')
