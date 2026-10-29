-- Cloudflare media without R2: uploaded files live inside the database as
-- fixed-size chunks (see MediaChunk in prisma/schema.prisma and the D1
-- backend in src/lib/storage.ts).
-- CreateTable
CREATE TABLE "MediaChunk" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storagePath" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BLOB NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "MediaChunk_storagePath_seq_key" ON "MediaChunk"("storagePath", "seq");

-- CreateIndex
CREATE INDEX "MediaChunk_storagePath_idx" ON "MediaChunk"("storagePath");

-- In-app notifications ("your capsule opened today") for vault and diary.
-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "postId" TEXT,
    "entryId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" DATETIME,
    CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Notification_kind_postId_key" ON "Notification"("kind", "postId");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_kind_entryId_key" ON "Notification"("kind", "entryId");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- Mark-once columns backing the notification sweep.
-- AlterTable
ALTER TABLE "Post" ADD COLUMN "notifiedAt" DATETIME;

-- AlterTable
ALTER TABLE "DiaryEntry" ADD COLUMN "notifiedAt" DATETIME;
