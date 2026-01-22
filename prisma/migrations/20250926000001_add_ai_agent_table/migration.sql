-- CreateTable
CREATE TABLE "ai_agents" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "name" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "agent_type" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB,
    "webhook_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_agents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ai_agents_service_agent_type_key" ON "ai_agents"("service", "agent_type");

-- CreateIndex
CREATE INDEX "ai_agents_is_active_idx" ON "ai_agents"("is_active");

-- CreateIndex
CREATE INDEX "ai_agents_service_idx" ON "ai_agents"("service");