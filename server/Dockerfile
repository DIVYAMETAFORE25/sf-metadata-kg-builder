# syntax=docker/dockerfile:1
FROM node:22-alpine
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund --omit=dev

COPY . .

EXPOSE 8787
CMD ["node", "index.js"]
