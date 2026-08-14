# TODOS

## Infrastructure

### `lib/supabase.ts` sombreia `lib/supabase/index.ts` — barrel morto, nunca alcançado por nenhum import

**What:** `@/lib/supabase` resolve pro arquivo solto `lib/supabase.ts`, não pra pasta `lib/supabase/index.ts` (confirmado: os dois arquivos existem lado a lado; resolução de módulo prioriza arquivo sobre `index` de pasta com mesmo nome). O barrel dentro de `lib/supabase/` está morto — nenhum import no projeto o alcança.

**Why:** Qualquer export adicionado só no barrel (`lib/supabase/index.ts`), por qualquer PR futuro, silenciosamente não existe em lugar nenhum do app real — sem erro de build, sem warning, só um `undefined` em runtime ou um import que "funciona" mas não é o código que o autor pensa que está editando.

**Context:** Achado durante T6 (`contact_product_interests`, 2026-08-06). Não corrigido de propósito — fora de escopo do T6. `CLAUDE.md` deste projeto instrui "importar sempre de `@/lib/supabase` (barrel export)", o que reforça a expectativa errada de que o barrel É o que está em uso. Precisa de decisão: (a) consolidar tudo em `lib/supabase.ts` e apagar o barrel morto em `lib/supabase/`, ou (b) migrar `lib/supabase.ts` pro conteúdo do barrel e apagar o arquivo solto, atualizando o `tsconfig`/imports se necessário. Baixo risco de execução, mas precisa de auditoria de todos os ~99 imports de `@/lib/supabase*` antes de escolher qual lado descartar — ver tentativa relacionada e frustrada em `DESAFIOS.md` (migração de imports diretos pro barrel quebrou `npm run build` por `server-only` vazando pro client bundle; qualquer fix aqui precisa considerar essa mesma armadilha).

**Effort:** S (a decisão) + S (a migração, depois de auditar)
**Priority:** P2
**Depends on:** None

## Completed
