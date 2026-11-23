-- Modo Teste por loja (Fase 11 / Onda 1.5)
-- Quando `testModeEnabled` está ligado, o webhook descarta qualquer contato que não esteja em
-- `testModeNumbers` (sem Lead/Conversation/Message/DevLog) e a IA só responde automaticamente
-- para esses números. Números normalizados em E.164 só com dígitos (ex.: "5598988451290").
ALTER TABLE "stores" ADD COLUMN "testModeEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "testModeNumbers" TEXT[] DEFAULT ARRAY[]::TEXT[];
