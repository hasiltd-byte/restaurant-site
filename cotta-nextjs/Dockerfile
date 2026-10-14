FROM node:24-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY app ./app
COPY shared ./shared
COPY public ./public
COPY scripts/run.mjs ./scripts/run.mjs
COPY orders-app/server.mjs orders-app/reservations.mjs ./orders-app/
COPY orders-app/public ./orders-app/public
COPY next.config.mjs tsconfig.json next-env.d.ts ./
RUN npm run build
ENV NODE_ENV=production ORDERS_PORT=4100 ORDERS_DATA_DIR=/data/tableflow
EXPOSE 3000
VOLUME ["/data/tableflow"]
CMD ["npm", "start"]
