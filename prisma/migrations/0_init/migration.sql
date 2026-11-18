-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'SELLER', 'DEV');

-- CreateEnum
CREATE TYPE "ProductCategory" AS ENUM ('BORDO', 'MEDIA_GRANDE', 'FRASQUEIRA', 'MOCHILA', 'ACESSORIOS');

-- CreateEnum
CREATE TYPE "LeadStage" AS ENUM ('NOVO', 'ATENDIMENTO_IA', 'INTERVENCAO_HUMANA', 'EM_NEGOCIACAO', 'FECHADO', 'PERDIDO');

-- CreateEnum
CREATE TYPE "AIStatus" AS ENUM ('ACTIVE', 'PAUSED', 'DISABLED');

-- CreateEnum
CREATE TYPE "MessageSender" AS ENUM ('CLIENT', 'AI', 'AGENT');

-- CreateEnum
CREATE TYPE "AITone" AS ENUM ('CONSULTIVO', 'VENDEDOR', 'DIRETO', 'AFETUOSO');

-- CreateEnum
CREATE TYPE "EmojiIntensity" AS ENUM ('NONE', 'MODERATE', 'EXPRESSIVE');

-- CreateEnum
CREATE TYPE "SlangType" AS ENUM ('NEUTRO', 'REGIONAL_SLZ', 'DESCONTRAIDO', 'FORMAL');

-- CreateEnum
CREATE TYPE "CTAStrategy" AS ENUM ('LINK_PAGAMENTO', 'DIRECIONAR_LOJA_FISICA', 'GRUPO_VIP_WHATSAPP', 'CONSULTOR_HUMANO');

-- CreateEnum
CREATE TYPE "KnowledgeSource" AS ENUM ('HUMANO_CHAT', 'MANUAL');

-- CreateEnum
CREATE TYPE "LogLevel" AS ENUM ('INFO', 'WARN', 'ERROR', 'AI_CALL');

-- CreateEnum
CREATE TYPE "ServiceName" AS ENUM ('EVOLUTION_API', 'OPENAI', 'GEMINI', 'CRM_WEBHOOK', 'TOKEN_BILLING');

-- CreateTable
CREATE TABLE "stores" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "segment" TEXT DEFAULT 'Malas de Viagem & Acessórios',
    "whatsappNumber" TEXT NOT NULL,
    "address" TEXT,
    "logoUrl" TEXT DEFAULT '/logo-malas-slz.jpg',
    "primaryColor" TEXT NOT NULL DEFAULT '#B3471A',
    "accentColor" TEXT NOT NULL DEFAULT '#D97706',
    "surfaceColor" TEXT NOT NULL DEFAULT '#FAF8F5',
    "interventionPauseHours" INTEGER NOT NULL DEFAULT 24,
    "vipGroupLink" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "role" "Role" NOT NULL DEFAULT 'SELLER',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT,
    "category" "ProductCategory" NOT NULL DEFAULT 'BORDO',
    "price" DECIMAL(10,2) NOT NULL,
    "pixPrice" DECIMAL(10,2),
    "stock" INTEGER NOT NULL DEFAULT 0,
    "minStock" INTEGER NOT NULL DEFAULT 3,
    "dimensions" TEXT,
    "colors" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "imageUrl" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "interest" TEXT,
    "estimatedValue" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "stage" "LeadStage" NOT NULL DEFAULT 'NOVO',
    "aiStatus" "AIStatus" NOT NULL DEFAULT 'ACTIVE',
    "pausedUntil" TIMESTAMP(3),
    "lastInteraction" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "urgent" BOOLEAN NOT NULL DEFAULT false,
    "urgentReason" TEXT,
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "assignedToId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "leadName" TEXT NOT NULL,
    "stage" "LeadStage" NOT NULL DEFAULT 'NOVO',
    "aiStatus" "AIStatus" NOT NULL DEFAULT 'ACTIVE',
    "pausedUntil" TIMESTAMP(3),
    "lastMessage" TEXT,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "sender" "MessageSender" NOT NULL,
    "text" TEXT NOT NULL,
    "mediaUrl" TEXT,
    "delivered" BOOLEAN NOT NULL DEFAULT true,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "isLearned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_configs" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "tone" "AITone" NOT NULL DEFAULT 'CONSULTIVO',
    "emojiIntensity" "EmojiIntensity" NOT NULL DEFAULT 'MODERATE',
    "slangType" "SlangType" NOT NULL DEFAULT 'DESCONTRAIDO',
    "ctaStrategy" "CTAStrategy" NOT NULL DEFAULT 'GRUPO_VIP_WHATSAPP',
    "maxWordsPerReply" INTEGER NOT NULL DEFAULT 55,
    "activeHoursStart" TEXT NOT NULL DEFAULT '08:00',
    "activeHoursEnd" TEXT NOT NULL DEFAULT '22:00',
    "respondOffHours" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_knowledge" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "source" "KnowledgeSource" NOT NULL DEFAULT 'HUMANO_CHAT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_knowledge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quick_replies" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "shortcut" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'geral',
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quick_replies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "follow_up_campaigns" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "triggerHours" INTEGER NOT NULL DEFAULT 24,
    "targetStage" "LeadStage" NOT NULL DEFAULT 'ATENDIMENTO_IA',
    "messageTemplate" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "conversionsCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "follow_up_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dev_logs" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "level" "LogLevel" NOT NULL DEFAULT 'INFO',
    "service" "ServiceName" NOT NULL DEFAULT 'CRM_WEBHOOK',
    "message" TEXT NOT NULL,
    "tokensIn" INTEGER DEFAULT 0,
    "tokensOut" INTEGER DEFAULT 0,
    "latencyMs" INTEGER DEFAULT 0,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dev_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stores_slug_key" ON "stores"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_storeId_idx" ON "users"("storeId");

-- CreateIndex
CREATE INDEX "products_storeId_active_idx" ON "products"("storeId", "active");

-- CreateIndex
CREATE INDEX "leads_storeId_stage_idx" ON "leads"("storeId", "stage");

-- CreateIndex
CREATE INDEX "leads_storeId_lastInteraction_idx" ON "leads"("storeId", "lastInteraction");

-- CreateIndex
CREATE INDEX "leads_storeId_aiStatus_pausedUntil_idx" ON "leads"("storeId", "aiStatus", "pausedUntil");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_leadId_key" ON "conversations"("leadId");

-- CreateIndex
CREATE INDEX "conversations_storeId_lastMessageAt_idx" ON "conversations"("storeId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "messages_conversationId_createdAt_idx" ON "messages"("conversationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ai_configs_storeId_key" ON "ai_configs"("storeId");

-- CreateIndex
CREATE INDEX "ai_knowledge_storeId_createdAt_idx" ON "ai_knowledge"("storeId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "quick_replies_storeId_shortcut_key" ON "quick_replies"("storeId", "shortcut");

-- CreateIndex
CREATE INDEX "dev_logs_storeId_createdAt_idx" ON "dev_logs"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "dev_logs_storeId_level_idx" ON "dev_logs"("storeId", "level");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_configs" ADD CONSTRAINT "ai_configs_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_knowledge" ADD CONSTRAINT "ai_knowledge_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quick_replies" ADD CONSTRAINT "quick_replies_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_up_campaigns" ADD CONSTRAINT "follow_up_campaigns_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dev_logs" ADD CONSTRAINT "dev_logs_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

