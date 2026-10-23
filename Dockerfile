# ─── Future Voices — production image ─────────────────────────────
FROM node:22-alpine

# sqlite + openssl live in the base image; add nothing fancy.
WORKDIR /app

# Persistent data (database + uploaded media) lives in /data.
# Mount a volume or host directory there.
ENV DATABASE_URL="file:/data/future-voices.db"
ENV UPLOAD_DIR="/data/uploads"
ENV NODE_ENV="production"

# Install dependencies first (better layer caching)
COPY package.json ./
COPY prisma ./prisma
RUN npm install --no-audit --no-fund && npx prisma generate

# Copy the rest of the app and build
COPY . .
RUN mkdir -p /data/uploads && npm run build

VOLUME ["/data"]
EXPOSE 3000

# `prisma db push` creates/updates the schema on first run (idempotent),
# then the production server starts and respects PORT (default 3000).
CMD ["sh", "-c", "npx prisma db push --skip-generate && npm run start -- -p ${PORT:-3000}"]
