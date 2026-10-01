# Personal WhatsApp MCP

Minimal MCP server that lets an MCP-compatible AI client send WhatsApp text messages through a personally linked WhatsApp account using Baileys.

> **Important:** This project uses the unofficial WhatsApp Web protocol implementation Baileys. It is not affiliated with or endorsed by WhatsApp/Meta. Use it only for personal testing and low-volume, consensual messaging. Account restrictions or loss of access are possible.

## Current scope

- QR-code login through WhatsApp Linked Devices
- Persistent Baileys authentication state
- `send_message` MCP tool
- `whatsapp_status` MCP tool
- Automatic reconnect after a temporary connection loss
- Minimal Node.js + TypeScript implementation

## Requirements

- Node.js 20+
- A WhatsApp account that can link another device
- An MCP-compatible local host

## Install

```bash
npm install
```

## Run

```bash
npm start
```

On the first run, a QR code is printed in the terminal. On your phone open WhatsApp → Settings → Linked Devices → Link a device, then scan the QR code.

The authentication state is stored in `./auth_info/` and should never be committed to GitHub.

## MCP tools

### `send_message`

Input:

```json
{
  "phoneNumber": "919876543210",
  "message": "Hello from my MCP server"
}
```

### `whatsapp_status`

Returns whether the WhatsApp socket is currently connected.

## Architecture

```text
AI / MCP Host
     |
     | MCP stdio
     v
Personal WhatsApp MCP
     |
     | Baileys WebSocket connection
     v
WhatsApp linked device
```

The MCP server exposes actions; Baileys handles the WhatsApp Web connection and message transport.

## Next step

Connect this local MCP server to the MCP host you want to use, then test `whatsapp_status` and `send_message` with a non-critical recipient before using it in a real workflow.
