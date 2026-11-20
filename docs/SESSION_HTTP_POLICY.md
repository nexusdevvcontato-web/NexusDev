# Política HTTP para sessões

**Status:** primitives isoladas; ainda não conectadas às rotas nem ao login.

## Transporte previsto

- Refresh token: cookie `__Host-nexusdev_refresh`, HttpOnly, Secure, Path=/, sem Domain.
- O cookie de refresh é host-only e nunca deve ser lido pelo JavaScript.
- Para CSRF em topologia frontend/API com hosts diferentes, adotar token sincronizador por sessão: API entrega token aleatório em resposta JSON com `Cache-Control: no-store`; frontend guarda apenas em memória e envia no header `X-CSRF-Token`.
- Backend guarda somente SHA-256 do token CSRF no registro da sessão; nunca persiste o token bruto.
- Requisições mutáveis autenticadas por cookie exigem Origin presente e correspondência exata com `CORS_ORIGINS`, além do token CSRF válido vinculado à sessão atual.
- Não aceitar wildcard, sufixo de domínio, Origin ausente, referer como substituto ou CSRF token vindo apenas do body.
- Ao rotacionar refresh, o token CSRF deve ser renovado ou mantido de forma explícita e atômica; a implementação deverá escolher e testar uma única regra antes da integração.

## SameSite e CORS

- SameSite continua sem valor final. `Lax` é apenas hipótese inicial para subdomínios same-site; não assumir que resolve todos os contextos.
- `SameSite=None` só deve ser escolhido se a arquitetura exigir contexto cross-site; requer Secure e testes de navegador.
- CORS deve aceitar apenas origens exatas e usar credentials quando cookies forem enviados. Nunca combinar credenciais com wildcard.
- Cookies de limpeza devem repetir SameSite e Path da emissão.

## Primitives existentes e limite

- `session-http-policy.js` contém utilitários de origem, comparação e atributos de cookie.
- `session-csrf-token.js` gera token sincronizador, calcula hash SHA-256 e verifica em tempo constante.
- Os helpers antigos de double-submit cookie permanecem apenas como primitives de teste; a arquitetura proposta para hosts separados não deve depender de um cookie CSRF legível pelo frontend.
- Ainda falta adicionar o hash CSRF ao schema de sessão, emitir o token no login/refresh, validar o header em middleware e integrar o frontend para mantê-lo em memória.
- Nenhum endpoint foi alterado e nenhum cookie é emitido nesta etapa.

## Testes

Cobrem token aleatório URL-safe, hash não reversível para uso normal, validação em tempo constante e rejeição de entradas malformadas. Testes end-to-end de CORS, cookies, rotação e CSRF em navegador continuam obrigatórios em staging.
