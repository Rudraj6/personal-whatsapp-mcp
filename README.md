# personal-whatsapp-mcp

Minimal remote MCP server for sending WhatsApp messages through a linked personal WhatsApp account using Baileys.

## Current architecture

```text
Claude / MCP client
        |
        | Streamable HTTP
        v
personal-whatsapp-mcp
        |
        v
     Baileys
        |
        v
 WhatsApp account
```

## Local development

Install dependencies:

```bash
npm install
```

Run the remote HTTP version:

```bash
npm start
```

Health check:

```text
http://localhost:3000/health
```

MCP endpoint:

```text
http://localhost:3000/mcp
```

For local MCP Inspector testing, use stdio instead:

```bash
npm run start:stdio
```

## WhatsApp authentication

The first run displays a QR code. On the WhatsApp phone:

**Settings → Linked devices → Link a device → Scan the QR code**

Authentication state is stored in `WHATSAPP_AUTH_DIR`. Keep this directory on persistent storage in production.

## Environment variables

```env
PORT=3000
WHATSAPP_AUTH_DIR=./local-data/whatsapp
MCP_PATH=/mcp
MCP_TRANSPORT=http
LOG_LEVEL=silent
```

For a public deployment, set `MCP_PATH` to a long random path rather than using the default `/mcp`. This is only a lightweight access barrier; a proper OAuth layer should be added before treating the server as production-grade.

## Exposed MCP tools

### `send_message`

```text
phoneNumber: international number without +
message: text to send
```

### `whatsapp_status`

Returns whether the Baileys WhatsApp session is currently connected.

## Cloud deployment requirement

The WhatsApp authentication directory must be on persistent storage. Do not deploy this to a platform where the filesystem is erased on restart or sleep.

The intended free deployment target is an always-on VM such as Oracle Cloud Infrastructure Always Free. Render's free web services are not suitable for this workload because they spin down after 15 minutes of inactivity and lose local filesystem changes on restart/redeploy. Railway's current free tier provides only $1/month of usage after its trial, so it is not a reliable always-free choice for an always-running WhatsApp connection.

## Important

Baileys is an unofficial WhatsApp Web protocol implementation. This project is for personal experimentation and automation. WhatsApp/Meta may restrict or suspend accounts using unofficial automation. Do not use this project for spam, bulk messaging, or attempts to evade platform enforcement.
