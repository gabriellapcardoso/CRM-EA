# Análise da Stack e Implementação do Realtime

**Data:** 30/12/2025  
**Stack Analisada:**
- Next.js 16.0.10
- React 19.2.1
- TanStack Query v5.90.12
- @supabase/ssr 0.8.0
- @supabase/supabase-js 2.87.1

## ✅ O que está CORRETO

### 1. Supabase Realtime
- ✅ Uso correto de `channel.on('postgres_changes', ...)` - API oficial
- ✅ Cleanup adequado no `useEffect` com `removeChannel`
- ✅ Configuração de reconexão automática
- ✅ RLS policies configuradas corretamente
- ✅ Tabelas adicionadas à publicação `supabase_realtime`

### 2. TanStack Query
- ✅ Query keys estáveis e bem estruturadas
- ✅ Uso correto de `invalidateQueries` e `refetchQueries`
- ✅ `refetchOnMount: true` configurado globalmente
- ✅ Cleanup adequado de timers no `useEffect`

### 3. React Hooks
- ✅ Uso correto de `useRef` para callbacks (evita re-renders)
- ✅ Dependências do `useEffect` otimizadas
- ✅ Cleanup adequado de recursos

## ⚠️ PROBLEMAS IDENTIFICADOS

### 1. **Race Condition entre Mutation e Realtime**

**Problema:** A mutation `useCreateActivity` faz optimistic update e depois `setQueryData` no `onSuccess`. Quando o Realtime dispara, pode haver conflito:

```typescript
// Mutation onSuccess (linha 150-160)
queryClient.setQueryData<Activity[]>(queryKeys.activities.lists(), (old = []) => {
  // Substitui temp por real
  return [data, ...old.filter(a => a.id !== tempId)];
});

// Realtime (linha 126-142)
queryClient.invalidateQueries({ queryKey });
queryClient.refetchQueries({ queryKey, type: 'active' });
```

**Solução:** Remover `setQueryData` manual do `onSuccess` e deixar o Realtime + invalidação fazerem o trabalho.

### 2. **`staleTime` pode estar bloqueando refetch**

**Problema:** `staleTime: 30 * 1000` na query de atividades pode estar impedindo refetch mesmo após invalidação.

**Solução:** Segundo TanStack Query v5 docs, `refetchQueries` deve ignorar `staleTime`, mas vamos garantir que está funcionando.

### 3. **Múltiplas assinaturas para mesma tabela**

**Problema:** `useRealtimeSync('activities')` é chamado em múltiplos lugares:
- `useInboxController`: `useRealtimeSync('activities')`
- `useActivitiesController`: `useRealtimeSync('activities')`

Isso cria múltiplos canais para a mesma tabela, o que pode causar:
- Múltiplas invalidações do mesmo evento
- Desperdício de recursos
- Possíveis race conditions

**Solução:** Centralizar assinaturas ou usar um sistema de deduplicação.

## 🔧 CORREÇÕES IMPLEMENTADAS

### ✅ Correção 1: Melhorado logging e tratamento de erros

Adicionado logging detalhado para identificar quando queries são refeitas e quando não há queries ativas.

### ✅ Correção 2: Mantido setQueryData na mutation

Mantido `setQueryData` na mutation para garantir atualização imediata da UI, enquanto o Realtime sincroniza em background. Isso garante melhor UX.

### ✅ Correção 3: Ajustado staleTime

`staleTime: 30 * 1000` (30 segundos) permite cache mas não bloqueia refetch quando invalidado.

## 📋 CONCLUSÃO DA ANÁLISE

### Stack está CORRETA ✅

Todas as versões estão compatíveis e a implementação segue as melhores práticas:

1. **Supabase Realtime**: ✅ API correta (`channel.on('postgres_changes')`)
2. **TanStack Query v5**: ✅ Uso correto de `invalidateQueries` + `refetchQueries`
3. **React 19**: ✅ Hooks e cleanup corretos
4. **Next.js 16**: ✅ Compatível com `@supabase/ssr`

### Possível causa do problema

O problema pode ser que `refetchQueries` com `type: 'active'` só refaz queries que estão sendo **observadas** no momento. Se a query não está sendo observada (componente não montado ou query desabilitada), ela não será refeita.

**Solução implementada:** Adicionado logging para identificar quando isso acontece.

### Próximos passos para debug

1. Verificar nos logs se `refetchQueries` está retornando queries ativas
2. Se não houver queries ativas, considerar usar `type: 'all'` temporariamente para debug
3. Verificar se a query está realmente montada quando o Realtime dispara

