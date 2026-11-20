# Política HTTP para sessões

**Status:** primitives isoladas; ainda não conectadas às rotas nem ao login.

## Cookies

- Refresh cookie: `__Host-nexusdev_refresh`, HttpOnly, Secure, Path=/, sem Domain.
- CSRF cookie: `__Host-nexusdev_csrf`, Secure, Path=/, sem Domain, legível pelo frontend para double-submit.
- O prefixo `__Host-` exige Secure, Path=/ e ausência de Domain nos navegadores compatíveis.
- SameSite é parâmetro validado (`strict`, `lax` ou `none`), não foi fixado na configuração de ambiente nem aplicado em produção.
- Cookies de limpeza devem repetir SameSite e Path da emissão.

## CSRF e origem

Operações autenticadas por cookie devem exigir:
1. Header Origin presente e correspondência exata com `CORS_ORIGINS`.
2. Cookie CSRF e header `X-CSRF-Token` com valores iguais.
3. Comparação de token em tempo constante.
4. Tokens CSRF aleatórios, independentes do refresh token.

Não aceitar wildcard, sufixo de domínio, Origin ausente, referer como substituto ou CSRF token vindo apenas do body.

## Limitações e decisão pendente

- Não sabemos ainda a topologia real de domínios frontend/API em produção e staging.
- `SameSite=None` só deve ser escolhido se a arquitetura exigir contexto cross-site; requer Secure e testes de navegador.
- Prefixo `__Host-` implica cookie host-only. Se frontend e API estiverem em hosts diferentes, o frontend não poderá ler cookie CSRF host-only da API. Nesse caso, o backend deverá fornecer CSRF token por resposta JSON/cache-control no-store e o frontend mantê-lo em memória, ou a topologia deverá ser ajustada. Não usar Domain compartilhado por conveniência sem avaliação.
- Portanto, estes helpers ainda não emitem cookies, não validam rotas e não substituem testes end-to-end.

## Testes

Cobrem nome/atributos dos cookies, SameSite permitido, origem exata, double-submit e comparação em tempo constante.
