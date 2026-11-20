# Política HTTP para sessões

**Status:** token CSRF sincronizador já é persistido por sessão e rotacionado atomicamente com refresh; ainda não conectado às rotas HTTP nem ao frontend.

## Transporte previsto

- Refresh token: cookie `__Host-nexusdev_refresh`, HttpOnly, Secure, Path=/, sem Domain.
- O cookie de refresh é host-only e nunca deve ser lido pelo JavaScript.
- Para frontend/API em hosts diferentes, a API entrega um token CSRF aleatório em resposta JSON com `Cache-Control: no-store`; frontend guarda apenas em memória e envia no header `X-CSRF-Token`.
- Backend persiste somente SHA-256 do token CSRF no registro da sessão; o campo tem `select: false` no Mongoose.
- Requisições mutáveis autenticadas por cookie exigirão Origin presente e correspondência exata com `CORS_ORIGINS`, além do token CSRF válido vinculado à sessão atual.
- Não aceitar wildcard, sufixo de domínio, Origin ausente, referer como substituto ou CSRF token vindo apenas do body.
- Regra escolhida: emitir um token CSRF novo na criação da sessão e renovar o token em toda rotação de refresh. O hash novo e o consumo do refresh anterior são gravados na mesma transação MongoDB; o token bruto só é retornado uma vez ao chamador.

## SameSite e CORS

- SameSite continua sem valor final. `Lax` é apenas hipótese inicial para subdomínios same-site; não assumir que resolve todos os contextos.
- `SameSite=None` só deve ser escolhido se a arquitetura exigir contexto cross-site; requer Secure e testes de navegador.
- CORS deve aceitar apenas origens exatas e usar credentials quando cookies forem enviados. Nunca combinar credenciais com wildcard.
- Cookies de limpeza devem repetir SameSite e Path da emissão.

## Primitives e limites

- `session-http-policy.js` contém utilitários de origem e atributos de cookie.
- `session-csrf-token.js` gera token sincronizador, calcula hash SHA-256 e verifica em tempo constante.
- `session-store.js` agora persiste o hash na sessão, devolve o token bruto na criação e renova hash/token atomicamente durante refresh.
- Nenhum endpoint foi alterado; nenhum cookie é emitido; middleware ainda não valida o token CSRF.
- A integração deverá carregar explicitamente `+csrfTokenHash` quando for validar, pois o campo não é selecionado por padrão.

## Testes

- Testes de integração MongoDB verificam token inicial, hash persistido, substituição no refresh e rejeição do token CSRF anterior.
- Testes end-to-end de CORS, cookies, rotação e CSRF em navegador continuam obrigatórios em staging.


## Middleware CSRF isolado

`session-csrf-middleware.js` adiciona uma camada de validação reutilizável, ainda não montada no Express:

1. Exige `Origin` presente e correspondência exata na allowlist.
2. Lê o cookie HttpOnly de refresh sem depender de `cookie-parser`.
3. Calcula o hash do refresh e procura somente token não consumido e não expirado.
4. Carrega a sessão ativa e expirada? não: consulta exige `revokedAt: null` e `expiresAt > now`.
5. Seleciona explicitamente `+csrfTokenHash` e compara o token sincronizador em tempo constante.
6. Anexa apenas `{ id, userId }` em `req.session`; não expõe hash nem refresh token.
7. Rejeita por padrão: 403 para origem/token/sessão inválidos e 503 se a persistência falhar.

O middleware recebe modelos e origens por injeção, permitindo testes isolados. Ainda falta decidir e implementar a estratégia de autenticação por cookie nos endpoints: o middleware CSRF não substitui autenticação nem autorização do usuário. Não o montar em rotas existentes até a migração coordenada de login, refresh, logout, CORS, cookies e frontend.

## Cobertura adicionada

`test/session-csrf-middleware.test.js` cobre origem exata, cookie/header, associação com refresh e sessão ativa, rejeição de token consumido/ausente, sessão ausente, e falha de banco em modo fail-closed.
