# Recomendações Específicas: Next.js/React

Você deve focar nos seguintes padrões e problemas comuns ao revisar código desta stack:

## 1. Ciclo de Vida do React e Hooks
*   **Arrays de Dependências do useEffect:**
    *   Verifique se as dependências declaradas em `useEffect`, `useMemo` ou `useCallback` estão corretas e completas. A ausência de dependências necessárias causa "stale closures" (dados obsoletos), enquanto a inclusão incorreta ou desnecessária de objetos/funções não-memorizados pode causar renderizações infinitas.
*   **Vazamentos de Memória e Recursos nos Efeitos:**
    *   Certifique-se de que qualquer efeito que crie timers (`setInterval`, `setTimeout`), assine eventos (`addEventListener`), estabeleça conexões (WebSockets, EventSource) ou utilize recursos globais retorne uma função de cleanup para destruí-los/limpá-los no final.

## 2. Next.js App Router & Arquitetura
*   **Server Components vs. Client Components:**
    *   Preste atenção no uso adequado da diretiva `'use client'`. Não use Client Components se os componentes puderem ser renderizados no servidor (Server Components).
    *   Evite passar dados não-serializáveis (ex.: funções, classes) como props de Server Components para Client Components.
*   **Segurança em API Routes / Server Actions:**
    *   Certifique-se de que todas as rotas de API (`app/api/*/route.ts`) ou Server Actions (funções marcadas com `'use server'`) realizem validação de sessão, autenticação e autorização adequadas do usuário antes de realizar qualquer alteração ou fornecer dados sensíveis. Nunca confie puramente em verificações feitas apenas no lado do cliente.
*   **Exposição de Chaves Secretas e Env Vars:**
    *   Certifique-se de que nenhuma chave de API ou segredo (ex: chaves privadas, senhas de banco) seja carregado em variáveis expostas ao cliente (variáveis que iniciam com o prefixo `NEXT_PUBLIC_`). Variáveis de ambiente sensíveis devem ser lidas exclusivamente em Server Components, Server Actions ou API Routes.
*   **Validação de Entrada em Chamadas de API:**
    *   Sempre valide os parâmetros e payloads de entrada nas rotas e Server Actions utilizando bibliotecas como `zod`, `yup` ou similar para mitigar injeção e dados corrompidos.
