FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --ignore-scripts --no-audit --no-fund
COPY . .
EXPOSE 4106
CMD ["npm", "start"]
