-- Adiciona notes a deal_items para preservar a observação de um interesse
-- de contato quando ele é convertido em item de deal.

ALTER TABLE public.deal_items
ADD COLUMN IF NOT EXISTS notes TEXT;
