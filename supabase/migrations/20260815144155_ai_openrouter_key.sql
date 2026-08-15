-- Chave de API da OpenRouter (novo provider primário de chat/agente).
-- Aditiva e reversível: ai_google_key permanece intacta, usada só para RAG
-- (Google File Search Store, sem equivalente na OpenRouter).
ALTER TABLE public.organization_settings
ADD COLUMN IF NOT EXISTS ai_openrouter_key TEXT DEFAULT NULL;

COMMENT ON COLUMN public.organization_settings.ai_openrouter_key IS
  'OpenRouter API key — provider primário de chat/agente (a partir de 2026-08). ai_google_key permanece separada, usada só para RAG (Google File Search Store).';
