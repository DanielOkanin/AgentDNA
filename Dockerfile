FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
EXPOSE 3456
CMD ["node", "dist/server.js"]
