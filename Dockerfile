FROM node:16-alpine

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create app directory
WORKDIR /usr/src/app

# Create node user and group with specific UID/GID for consistency
RUN addgroup -g 1001 -S nodejs && \
    adduser -S expressjs -u 1001

# Copy package files
COPY package*.json ./

# Install dependencies with better caching and error handling
RUN npm ci --only=production --no-audit --no-fund && \
    npm cache clean --force

# Copy application code
COPY . .

# Change ownership of the app directory to expressjs user
RUN chown -R expressjs:nodejs /usr/src/app

# Switch to non-root user for security
USER expressjs

# Expose the port the app runs on
EXPOSE 3000

# Add healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "app.js"]
