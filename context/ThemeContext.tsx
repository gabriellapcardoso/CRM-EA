/**
 * @fileoverview Contexto de Tema (Dark Mode)
 * 
 * Provider React que gerencia preferência de tema (claro/escuro) com
 * persistência em localStorage e sincronização com classe CSS do documento.
 * 
 * @module context/ThemeContext
 * 
 * @example
 * ```tsx
 * // No App.tsx
 * <ThemeProvider>
 *   <App />
 * </ThemeProvider>
 * 
 * // Em qualquer componente
 * function ThemeToggle() {
 *   const { darkMode, toggleDarkMode } = useTheme();
 *   
 *   return (
 *     <button onClick={toggleDarkMode}>
 *       {darkMode ? '☀️ Claro' : '🌙 Escuro'}
 *     </button>
 *   );
 * }
 * ```
 */

import React, { createContext, useContext, useEffect, ReactNode } from 'react';

/**
 * Tipo do contexto de tema
 * 
 * @interface ThemeContextType
 * @property {boolean} darkMode - Se o modo escuro está ativo
 * @property {() => void} toggleDarkMode - Alterna entre claro e escuro
 */
interface ThemeContextType {
  darkMode: boolean;
  toggleDarkMode: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

/**
 * Provider de tema da aplicação
 * 
 * O redesign 2026-08 adota um sistema de design light-only (ver
 * REDESIGN-CRM.md) e removeu o toggle da topbar — nenhum lugar da UI
 * expõe mais `toggleDarkMode`. Manter a leitura da preferência antiga
 * (`crm_dark_mode`) do localStorage travava usuários que já tinham
 * escolhido "escuro" antes do redesign num modo escuro sem escape (o
 * `dark:` de componentes ainda não migrados voltava a ativar, sem
 * nenhum botão pra desligar de novo). Por isso o provider agora força
 * `light` sempre e limpa a chave antiga, em vez de honrar o valor salvo.
 *
 * @param {Object} props - Props do componente
 * @param {ReactNode} props.children - Componentes filhos
 */
export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const darkMode = false;

  useEffect(() => {
    document.documentElement.classList.remove('dark');
    try {
      window.localStorage.removeItem('crm_dark_mode');
    } catch {
      // localStorage indisponível (SSR/modo privado) — sem efeito prático
    }
  }, []);

  const toggleDarkMode = () => {
    // No-op: dark mode não é mais uma opção de UI (ver comentário acima).
  };

  return (
    <ThemeContext.Provider value={{ darkMode, toggleDarkMode }}>
      {children}
    </ThemeContext.Provider>
  );
};

/**
 * Hook para acessar contexto de tema
 * 
 * Retorna estado do tema e função para alternar.
 * Deve ser usado dentro de um ThemeProvider.
 * 
 * @returns {ThemeContextType} Estado e controles do tema
 * @throws {Error} Se usado fora do ThemeProvider
 * 
 * @example
 * ```tsx
 * function Header() {
 *   const { darkMode } = useTheme();
 *   return <header className={darkMode ? 'bg-slate-900' : 'bg-white'}>...</header>;
 * }
 * ```
 */
export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
