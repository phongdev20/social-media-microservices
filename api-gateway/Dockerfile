# use the official node.js 20 image with alpine linux as the base image

FROM node:20-alpine

WORKDIR /app/src/app

COPY package*.json ./

RUN npm ci -only=production

COPY . .

EXPOSE 3000

CMD [ "node", "src/server.js" ]