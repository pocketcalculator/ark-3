FROM node:20-alpine
WORKDIR /app
COPY package.json ./
COPY index.js ./
USER node
EXPOSE 8080
CMD ["node", "index.js"]
