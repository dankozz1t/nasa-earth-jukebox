# syntax=docker/dockerfile:1
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-fund --no-audit
COPY index.html tsconfig.json vite.config.ts ./
COPY public ./public
COPY src ./src
# tsc runs first, so a type error fails the image build
RUN npm run build

# nginx serves the bundle and proxies /api to the backend
FROM nginx:1.27-alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
