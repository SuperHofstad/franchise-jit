FROM node:24-alpine
WORKDIR /app

# Switch to Alpine Edge repositories and upgrade to get the absolute latest security patches (e.g. BusyBox fix)
RUN echo "https://dl-cdn.alpinelinux.org/alpine/edge/main" > /etc/apk/repositories && \
    echo "https://dl-cdn.alpinelinux.org/alpine/edge/community" >> /etc/apk/repositories && \
    apk update && apk upgrade --no-cache && \
    npm install -g npm@latest

# Install dependencies and set ownership for the node user
COPY --chown=node:node package*.json ./
RUN npm install --production

# Copy app code with node ownership
COPY --chown=node:node index.js .
COPY --chown=node:node default_timelines/ ./default_timelines/

# Prepare the config directory
RUN mkdir -p /config && chown -R node:node /config
VOLUME /config

# Switch to non-root user
USER node

EXPOSE 3005
CMD [ "node", "index.js" ]
