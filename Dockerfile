FROM node:22-bookworm-slim

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY tsconfig.json ./
COPY src ./src

ENV NODE_ENV=production
ENV PORT=3000
ENV WHATSAPP_AUTH_DIR=/data/whatsapp

EXPOSE 3000

CMD ["npm", "start"]
