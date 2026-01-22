-- Add MCP access control to TaskList
ALTER TABLE "TaskList" ADD COLUMN "mcpEnabled" BOOLEAN DEFAULT false;
ALTER TABLE "TaskList" ADD COLUMN "mcpAccessLevel" TEXT DEFAULT 'WRITE';

-- Create MCP tokens table for persistent storage
CREATE TABLE "MCPToken" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "token" TEXT NOT NULL UNIQUE,
  "listId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "permissions" TEXT[] NOT NULL,
  "description" TEXT,
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "MCPToken_listId_fkey" FOREIGN KEY ("listId") REFERENCES "TaskList"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MCPToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Create indexes for performance
CREATE INDEX "MCPToken_listId_idx" ON "MCPToken"("listId");
CREATE INDEX "MCPToken_userId_idx" ON "MCPToken"("userId");
CREATE INDEX "MCPToken_token_idx" ON "MCPToken"("token");
CREATE INDEX "MCPToken_expiresAt_idx" ON "MCPToken"("expiresAt");
CREATE INDEX "MCPToken_isActive_idx" ON "MCPToken"("isActive");

-- Add MCP settings to User
ALTER TABLE "User" ADD COLUMN "mcpEnabled" BOOLEAN DEFAULT true;
ALTER TABLE "User" ADD COLUMN "mcpSettings" TEXT;

-- Create index for TaskList MCP fields
CREATE INDEX "TaskList_mcpEnabled_idx" ON "TaskList"("mcpEnabled");