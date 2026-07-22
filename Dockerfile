# Base Image
FROM node:20-slim

# Install system dependencies for Playwright, SQLite, and Sharp
RUN apt-get update && apt-get install -y \
    python3 make g++ sqlite3 \
    libwoff1 libopus0 libwebp7 libwebpdemux2 \
    libenchant-2-2 libgudev-1.0-0 libsecret-1-0 \
    libhyphen0 libgdk-pixbuf2.0-0 libegl1 \
    libnotify4 libxslt1.1 libevent-2.1-7 \
    libgles2 libxcomposite1 libatk1.0-0 \
    libatk-bridge2.0-0 libepoxy0 libgtk-3-0 \
    libharfbuzz-icu0 \
    # Sharp native dependencies
    vips-dev \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm install

# Install Playwright browsers (Chromium only to save space)
RUN npx playwright install chromium

# Copy project files
COPY . .

# Build frontend
RUN npm run build

# Create data directory for SQLite and browser data
RUN mkdir -p data browser_data

# Expose ports
EXPOSE 3000 3001

# Environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Production start command: run the backend directly (not via nodemon)
# The backend serves the built frontend static files from dist/
CMD ["node", "--experimental-loader", "tsx/esm", "api/server.ts"]
