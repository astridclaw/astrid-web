# Claude Code Remote Server
# Self-hosted server for receiving Astrid webhooks and executing Claude Code CLI

FROM node:20-slim

# Install git, curl, gh CLI, and other dependencies
RUN apt-get update && apt-get install -y \
    git \
    curl \
    ca-certificates \
    gnupg \
    && rm -rf /var/lib/apt/lists/*

# Install GitHub CLI (gh)
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
    && apt-get update \
    && apt-get install -y gh \
    && rm -rf /var/lib/apt/lists/*

# Install Claude Code CLI globally
RUN npm install -g @anthropic-ai/claude-code

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies
RUN npm install --omit=dev

# Copy TypeScript config and source
COPY tsconfig.json ./
COPY src ./src

# Install dev dependencies for build, then build, then remove dev deps
RUN npm install && npm run build && npm prune --production

# Create non-root user for security (Claude Code requires non-root for --dangerously-skip-permissions)
# Use UID 999 to match fly.io's default volume mount permissions
RUN groupadd -r -g 999 claude && useradd -r -u 999 -g claude -d /home/claude -m claude

# Create persistent directory structure that matches fly.toml mount expectations
# On Fly.io, /app/persistent is mounted as a persistent volume
# The entrypoint script will symlink ~/.claude → /app/persistent/.claude
RUN mkdir -p /app/persistent/sessions /app/persistent/repos /app/persistent/.claude /home/claude && \
    chown -R claude:claude /app /home/claude

# Copy and setup entrypoint script
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Set environment
ENV NODE_ENV=production
ENV PORT=3001
ENV HOME=/home/claude

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

# Switch to non-root user
USER claude

# Use entrypoint to setup auth, then run the server
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "dist/server.js"]
