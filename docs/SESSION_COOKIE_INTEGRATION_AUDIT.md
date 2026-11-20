# Auditoria de integração da autenticação por sessão — Render e Vercel

**Status:** auditoria documental concluída; nenhuma rota, segredo, variável, banco ou serviço foi alterado.
**Branch:** `rebuild/v2-security`.
**Render atual informado:** `https://nexusdev-1rq3.onrender.com`.
**Frontend:** Vercel, com Preview separado para a branch de reconstrução.
**Objetivo:** definir uma migração segura do Bearer legado para sessões com refresh cookie, sem interromper a produção.

## 1. Escopo e limite de verificação

A análise comparou os arquivos versionados na branch `main` com a branch `rebuild/v2-security`. Não foi possível confirmar por esta auditoria qual SHA exato está implantado atualmente no Render, nem ler as variáveis privadas do painel. O endpoint público de health também não ficou acessível pelo leitor utilizado. Portanto, as conclusões sobre o Render descrevem o código versionado em `main`, não uma inspeção autenticada do ambiente em execução.

Nenhum request de login, escrita, alteração de dados, deploy ou chamada autenticada foi realizado contra o Render atual.

## 2. Estado observado

### Backend `main` (referência de produção no repositório)

- Login por e-mail/senha e Google devolve JWT no JSON.
- `requireAuth` lê `Authorization: Bearer` e verifica JWT.
- O segredo JWT tem fallback hardcoded no código (`nexusdev-super-secret-key-2026`) se a variável não estiver definida.
- CORS usa `FRONTEND_URL` ou `*`; o código inclui `credentials: true`.
- O JSON body limit é 2 MB.
- Não há rotas de refresh/logout com sessão persistida identificadas no `server.js` de `main`.
- O frontend `main` aponta diretamente para o hostname Render e guarda o token em `localStorage`.

**Conclusão:** o código `main` ainda representa o modelo legado Bearer. Não deve receber configuração de cookies ou ser tratado como compatível com a nova arquitetura sem uma migração explícita, testes e revisão.

### Backend `rebuild/v2-security`

- O config remove o fallback JWT, exige segredo forte e origens explícitas em produção.
- Login e cadastro ainda emitem token Bearer; `requireAuth` ainda exige Bearer.
- Modelos `Session` e `RefreshToken`, armazenamento hash-only, rotação, detecção de replay e revogação foram preparados.
- Política de cookie `__Host-nexusdev_refresh` e helpers CSRF foram preparados.
- `createSessionCsrfMiddleware` existe, mas não está montado no Express.
- Não foram identificadas rotas HTTP integradas de criação/refresh/logout/listagem/revogação de sessões.
- A função CSRF isolada procura o refresh cookie para localizar a sessão; ela não substitui middleware de autenticação de acesso para todas as rotas privadas.

**Conclusão:** a branch tem primitives e testes de unidade/integração para sessões, mas o ciclo HTTP completo ainda não existe. Não habilitar cookies no Render com base apenas nesses módulos.

### Frontend `rebuild/v2-security`

- `VITE_API_BASE_URL` vazio produz caminhos relativos, aptos ao futuro proxy Vercel.
- O fluxo de autenticação ainda consome `token` do JSON, grava `nexusdev_token` no `localStorage` e envia `Authorization: Bearer`.
- `/api/me`, comentários, preferências, exportação, reautenticação, certificados e operações de progresso ainda dependem de Bearer.
- Logout remove o token local; não revoga sessão no servidor.
- Não há ainda bootstrap por refresh cookie nem armazenamento do access token somente em memória.

**Conclusão:** frontend e backend da branch continuam coerentes com Bearer legado em vários pontos, mas ainda não estão integrados ao novo modelo de sessão.

## 3. Decisão de topologia

A topologia preferida continua sendo:

`Navegador → origem Vercel (/api/*) → rewrite externo → Render`

Quando o browser chama `https://nexusdev-frontend.vercel.app/api/...`, o browser vê uma origem única. Isso evita depender de cookies third-party entre `vercel.app` e `onrender.com`.

Requisitos para o proxy:
- Rewrite externo específico para `/api/(.*)`, antes do fallback SPA.
- Destino deve ser o host exato do Render que for autorizado para o ambiente correspondente.
- Para produção, o destino só pode ser o Render atual após uma migração de produção explicitamente aprovada e ensaiada; não apontar Preview de desenvolvimento para o banco/serviço atual.
- Não criar cache para `/api/*`; respostas privadas e de autenticação devem ser `Cache-Control: no-store`.
- Confirmar encaminhamento de `Cookie`, `Set-Cookie`, `Origin` e cabeçalhos CSRF no Preview real.
- Cookie `__Host-` precisa ser emitido sem `Domain`, com `Secure` e `Path=/`; a origem que o browser vê é a Vercel.

O arquivo `vercel.json` permanece intencionalmente sem destino externo até que o alvo e o ambiente sejam explicitamente definidos.

## 4. Fluxo HTTP necessário antes de qualquer ativação

### Login e cadastro

1. Validar credenciais no servidor como hoje.
2. Criar sessão persistida por dispositivo e refresh token aleatório; persistir somente hash do refresh token.
3. Definir refresh cookie HttpOnly, Secure, Path=/, sem Domain e SameSite compatível com a topologia.
4. Retornar access token de curta duração e CSRF token no JSON, com `Cache-Control: no-store`.
5. Frontend guarda access token apenas em memória; nunca em localStorage, sessionStorage, URL ou logs.
6. Para Google, verificar credential no backend e seguir exatamente o mesmo fluxo de criação de sessão.

### Refresh

1. Receber refresh cookie automaticamente pelo proxy same-origin.
2. Exigir Origin exato e proteção CSRF no endpoint de refresh.
3. Rotacionar refresh token atomicamente e detectar reutilização; replay revoga a família.
4. Emitir novo cookie e novo CSRF token; invalidar o CSRF anterior.
5. Retornar access token novo e não cacheável.
6. Definir claramente tratamento de concorrência entre múltiplas abas e refresh simultâneo.

### Rotas privadas

- Separar autenticação por access token curto (Bearer em memória, contendo identificador da sessão) da validação CSRF para operações que usam cookies.
- Validar que a sessão associada ao access token continua ativa/revogável; não aceitar JWT legado sem vínculo a sessão depois do corte.
- Para operações mutáveis, exigir Origin exato e CSRF token conforme política escolhida.
- Não exigir refresh cookie como substituto de access token em todas as rotas.
- Manter autorização por usuário e propriedade dos recursos no servidor.

### Logout e gestão de sessões

- Logout atual deve revogar a sessão corrente no servidor e limpar refresh cookie; frontend também apaga o access token da memória.
- Logout-all revoga todas as sessões do usuário e limpa cookie corrente.
- Listar e revogar dispositivos exige autenticação forte e ownership.
- Respostas de logout devem ser idempotentes e `no-store`.
- A migração precisa decidir como invalidar JWTs Bearer antigos; não presumir que apagar localStorage revoga tokens copiados.

## 5. Pontos de correção antes da integração

1. Implementar modelos/store no bootstrap real do servidor, com conexão MongoDB pronta e índices criados de forma controlada.
2. Implementar rotas HTTP de login/cadastro com sessão, refresh, logout, logout-all, sessões e revogação por ID.
3. Criar middleware separado para access-token vinculado a sessão; não reutilizar o middleware CSRF como autenticação geral.
4. Definir CSRF coerente. Hoje existem nomes de cookie e header CSRF, mas o middleware isolado valida o header contra hash persistido na sessão e não lê o cookie CSRF. Documentação e implementação devem escolher explicitamente synchronizer-token (header + hash servidor) ou double-submit (cookie + header) e testar a mesma estratégia ponta a ponta.
5. Revisar a política de rotação e concorrência, incluindo duas abas, refresh expirado, replay e revogação.
6. Adaptar todos os fetches autenticados do frontend para um único cliente API; incluir credenciais no fetch quando cookies forem usados, tratar 401 com refresh controlado e evitar refresh em loop.
7. Migrar Google e e-mail/senha para o mesmo contrato de sessão.
8. Atualizar reautenticação para exigir access token de sessão e decidir como a prova curta de reautenticação será consumida em ações sensíveis futuras.
9. Criar testes HTTP end-to-end com cookies reais e navegador, não apenas testes isolados dos helpers.
10. Validar proxy Vercel e Render com ambiente de teste isolado antes de qualquer produção.

## 6. Matriz mínima de testes

- Login e cadastro em e-mail/senha e Google: cookie emitido; access token não persistido no browser.
- Cookie: Secure, HttpOnly, Path=/, sem Domain, prefixo `__Host-`, SameSite decidido e documentado.
- Refresh: sucesso, expiração, token inválido, rotação, replay, concorrência e família revogada.
- CSRF: Origin ausente, origem não permitida, header ausente, token errado, token anterior após rotação.
- Sessão: access token expirado, sessão revogada, logout, logout-all e revogação de outro dispositivo.
- Browser: reload restaura sessão via refresh, múltiplas abas, cookies bloqueados, cold start do Render.
- Proxy: host visível Vercel, `Set-Cookie` aplicado, `Cookie` encaminhado, nenhum cache, CORS/Origin exatos.
- Privacidade operacional: nenhum token, senha ou cookie em logs, analytics, URL ou mensagens de erro.

## 7. Sequência segura recomendada

1. Concluir implementação e testes do ciclo de sessão somente na branch `rebuild/v2-security`.
2. Fazer deploy de Preview Vercel e backend de teste separado, com banco de teste separado.
3. Validar todos os cenários da matriz em navegador real.
4. Fazer revisão de segurança e compatibilidade, incluindo estratégia de migração/invalidação de Bearer legado.
5. Apresentar plano de migração do Render atual, incluindo variáveis necessárias, downtime/compatibilidade e rollback.
6. Só executar mudança de produção após autorização específica.

## 8. Bloqueios e limites atuais

- Não foi confirmado o SHA implantado no Render atual.
- Não foram inspecionadas variáveis/secrets do Render.
- Não existe hostname de staging confirmado.
- O proxy externo não foi configurado.
- O ciclo de sessão ainda não está integrado às rotas Express nem ao frontend.
- Nenhum teste browser-to-Render foi executado.
- Nenhuma alteração foi feita em produção, Render, Vercel settings, banco ou secrets.

**Resultado:** a arquitetura de destino está definida, mas a migração não está pronta para ativação. O próximo trabalho seguro é implementar o contrato HTTP completo de sessões na branch, começando pelo backend e mantendo Bearer legado isolado até os testes passarem.
