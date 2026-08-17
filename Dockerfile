FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY web ./web
USER node
ENV PORT=8080
EXPOSE 8080
CMD ["node", "src/server.mjs"]
