FROM node:20-alpine

# Install required packages: curl, ca-certificates, gnupg, bash, docker CLI
RUN apk add --no-cache curl ca-certificates bash gnupg docker-cli

WORKDIR /app

# Copy package.json and install dependencies
COPY package.json .
RUN npm install --production

# Copy all app files
COPY . .

# Start the app
CMD ["node", "server.js"]
