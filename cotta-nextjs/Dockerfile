FROM node:24-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY app ./app
COPY shared ./shared
COPY public ./public
COPY orders-app ./orders-app
COPY next.config.mjs tsconfig.json ./
RUN npm run build
ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "start"]
