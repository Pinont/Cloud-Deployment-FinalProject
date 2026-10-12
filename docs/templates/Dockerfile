# Template for a service Dockerfile. Copy to <service>/Dockerfile.
# Set PORT to the service port (auth 3001, restaurant 3002, review 3003, favorite 3004).
FROM node:20-alpine
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

USER node
CMD ["node", "src/server.js"]
