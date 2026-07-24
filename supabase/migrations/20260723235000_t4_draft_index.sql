-- ============================================================================
-- T4 pré-requisito — UI de rascunho no inbox (TODOS.md, gerador de propostas)
--
-- Índice parcial pra badge/filtro de rascunhos: sem ele, a lista de conversas
-- teria que varrer messaging_messages inteira pra saber quais conversas têm
-- rascunho pendente (status='draft', só existe hoje via T2, volume baixo mas
-- cresce a cada demo registrada na prospecção).
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_messaging_messages_draft
  ON public.messaging_messages(conversation_id)
  WHERE status = 'draft';
