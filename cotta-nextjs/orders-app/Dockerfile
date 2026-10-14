FROM node:24-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY server.mjs reservations.mjs menu.json ./
COPY public ./public
ENV ORDERS_PORT=4100 ORDERS_DATA_DIR=/data/tableflow
EXPOSE 4100
VOLUME ["/data/tableflow"]
CMD ["node", "server.mjs"]
