# Recomendações Específicas: TypeScript (Node.js/TypeScript)

Você deve focar nos seguintes padrões e problemas comuns ao revisar código desta stack:

## 1. Tipagem e Segurança no TypeScript
*   **Evite o uso de `any`:**
    *   O uso de `any` anula as vantagens de segurança do compilador TypeScript. Prefira usar `unknown` (se o tipo for desconhecido e exigir validação em tempo de execução) ou criar interfaces e tipos adequados.
*   **TypeScript Estrito (Strict Mode):**
    *   Preste atenção a possíveis erros relacionados a `null` ou `undefined`. Verifique se há verificações de nulidade adequadas em propriedades opcionais.
*   **Conversões de Tipo (`Type Assertions`):**
    *   Evite o uso excessivo de `as Type` (type assertion) ou exclamação (`!`) para forçar tipos não-nulos. Prefira checagens explícitas ou guards (`if (value != null)`).

## 2. Padrões do Node.js e ESM (ECMAScript Modules)
*   **Extensões em Imports Relativos:**
    *   Este projeto utiliza `"type": "module"` (ESM). Todos os imports relativos de arquivos locais **devem** incluir a extensão `.js` explicitamente no caminho (ex.: `import { foo } from './foo.js'`), mesmo que os arquivos de origem sejam `.ts`.
*   **Tratamento de Promises e Async/Await:**
    *   Sempre trate as rejeições de Promises. Evite disparar Promises flutuantes em background sem `.catch()` ou sem um `try/catch` envolvente.
*   **Gerenciamento de Recursos e I/O:**
    *   Garanta que a leitura e escrita de arquivos ou streams utilizem recursos seguros (como os módulos de `node:fs` ou `node:fs/promises`) e limpe/feche descritores de arquivo abertos para evitar memory leaks ou resource leaks.

## 3. Qualidade de Testes e Estrutura de Código
*   **Asserções Estritas em Testes:**
    *   Prefira o uso de asserções estritas (ex: `node:assert/strict`) para evitar falsos positivos nos testes unitários.
    *   Evite lógica complexa ou chamadas a APIs externas reais dentro de testes unitários sem mockar os recursos adequadamente.
