# Recomendações Específicas: PHP/Laravel

Você deve focar nos seguintes padrões e problemas comuns ao revisar código desta stack:

## 1. Banco de Dados & Eloquent
*   **Problema de Query N+1 (N+1 Query Problem):**
    *   Fique muito atento à iteração de coleções do Eloquent que acessam relacionamentos (ex: `$book->author->name` dentro de um `foreach ($books)`). Se as relações não forem pré-carregadas via Eager Loading (`with('relation')`), isso gerará dezenas ou centenas de queries desnecessárias ao banco.
*   **SQL Injection em Raw Queries:**
    *   Evite o uso de strings interpoladas diretamente em métodos como `whereRaw`, `selectRaw`, `orderByRaw`, `havingRaw`, etc. Sempre utilize bindings de parâmetros (placeholder `?` ou named parameters) para proteger as queries de injeção de SQL.

## 2. Controllers e Validação de Entrada
*   **Validação Estrita:**
    *   Toda entrada do usuário deve ser validada explicitamente. Prefira a criação de classes `FormRequest` customizadas para encapsular as regras de validação.
    *   Evite acessar dados do request diretamente sem validação prévia (ex: `$request->input('data')` ou `$request->all()`).
*   **Mass Assignment Vulnerabilities:**
    *   Assegure-se de que os Models tenham propriedades `$fillable` bem restritas ou que as criações não passem objetos de requisição inteiros sem validação ou filtragem (`Model::create($request->all())`).

## 3. Segurança e Autorização
*   **CSRF Protection:**
    *   Verifique se formulários HTML gerados por Blade incluem a diretiva `@csrf` para enviar o token de proteção. Rotas que modificam dados (POST, PUT, DELETE, PATCH) não devem ser excluídas da proteção CSRF sem justificativa de segurança robusta.
*   **Autorização de Recursos:**
    *   Endpoints que realizam ações ou leem dados privados de usuários devem validar a permissão correspondente utilizando Laravel Gates ou Policies (ex: `$this->authorize('update', $post)` ou middleware `can:update,post`).
*   **Vazamento de Segredos / Dados Sensíveis:**
    *   Garanta que exceções ou erros de banco não vazem informações confidenciais para usuários finais em produção. Certifique-se de que a configuração `APP_DEBUG` nunca esteja ativa/hardcoded como `true` no código.
