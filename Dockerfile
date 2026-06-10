# syntax=docker/dockerfile:1

# ---- Build stage ----------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app

# Install dependencies first to leverage Docker layer caching.
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

# Build the static site.
COPY . .
RUN npm run build

# ---- Runtime stage --------------------------------------------------------
FROM nginx:1.27-alpine AS runtime

# SPA-friendly nginx config (history fallback to index.html).
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Static assets produced by Vite.
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
