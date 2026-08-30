FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci

COPY . .

ARG EXPO_PUBLIC_GATEWAY_URL=http://localhost
ENV EXPO_PUBLIC_GATEWAY_URL=${EXPO_PUBLIC_GATEWAY_URL}

RUN npx expo export --platform web


FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q --spider http://127.0.0.1/ || exit 1