# ADR: arquitetura de sessões seguras

**Status:** proposta técnica; implementação integrada pendente.  
**Branch:** `rebuild/v2-security`.  
**Produção:** não acessada nem modificada.

## Contexto

O frontend persiste o bearer token em `localStorage`. O logout atual remove apenas o token local. O backend valida JWT HS256 e recarrega o usuário, mas não mantém registro de sessões nem revoga tokens individuais. Um token copiado pode continuar válido até expirar.

## Decisão proposta

Adotar sessões persistidas por dispositivo, access tokens curtos e refresh tokens opacos rotativos.

### Access token
- JWT HS256 de 5–10 minutos, claims mínimos `sub`, `sid`, `iss`, `aud`, `iat`, `exp`, `jti`.
- Validar algoritmo, emissor, audiência, expiração e sessão ativa em cada requisição protegida.
- Não incluir dados pessoais ou permissões mutáveis.

### Refresh token
- Segredo opaco aleatório com alta entropia; nunca JWT.
- Persistir somente hash no banco.
- Rotacionar atomicamente em cada refresh.
- Reutilização de token anterior revoga a família da sessão.
- Definir expiração absoluta e por inatividade.

### Registro Session
Campos mínimos: identificador aleatório, `userId`, hash do refresh token, `createdAt`, `lastUsedAt`, `expiresAt`, `revokedAt`, motivo categorizado e identificador de família. Índice TTL é apenas limpeza; toda operação valida explicitamente expiração e revogação.

### Transporte
Preferência: refresh em cookie `HttpOnly; Secure`, com `SameSite` definido após confirmar a topologia dos domínios. Para cookies cross-site, exigir CORS com origem exata, credenciais e proteção CSRF/Origin. Access token somente em memória no frontend. Nunca persistir tokens em localStorage, sessionStorage, IndexedDB, URLs ou logs.

Não escolher configuração de cookie antes de confirmar os domínios reais de frontend/API e staging.

## Endpoints previstos
- `POST /api/auth/refresh`: rotaciona refresh e retorna access token curto.
- `POST /api/auth/logout`: revoga sessão atual e limpa cookie.
- `POST /api/auth/logout-all`: revoga todas as sessões após autenticação recente.
- `GET /api/auth/sessions`: lista sessões próprias sem segredos.
- `DELETE /api/auth/sessions/:id`: revoga sessão pertencente ao usuário.

Todos com rate limit, respostas `Cache-Control: no-store` e proteção CSRF quando aplicável. Login, cadastro e Google passam a criar sessões; refresh token nunca é retornado em JSON.

## Migração gradual
1. Criar schema/serviços sem mudar login existente.
2. Testar criação, hash, rotação, replay, expiração, revogação e concorrência.
3. Criar endpoints e validar em staging.
4. Migrar frontend para access token em memória e refresh por cookie.
5. Integrar login senha/Google, CORS e CSRF.
6. Testar staging com contas descartáveis.
7. Planejar invalidação de JWTs legados e comunicação.
8. Produção somente com autorização explícita.

Não manter fallback silencioso para token persistido em localStorage.

## Testes obrigatórios
- Login senha/Google cria sessão distinta.
- Refresh válido rotaciona; token antigo é rejeitado.
- Replay revoga família.
- Duas rotações concorrentes: exatamente uma vence.
- Logout revoga a sessão e seu access token retorna 401.
- Logout-all revoga todas; revogação individual preserva outras.
- Sessão expirada/inativa retorna 401.
- Cookie adulterado/ausente, CSRF inválido e origem não permitida são rejeitados.
- Respostas auth usam no-store.
- Segredos não aparecem em logs.
- Limite de sessões e limpeza TTL são testados.

## Pendências antes da implementação
1. Confirmar domínios de frontend/API em produção e staging.
2. Confirmar necessidade de cookies cross-site.
3. Aprovar tempos de access, inatividade e expiração absoluta.
4. Definir limite de sessões e política de encerramento.
5. Identificar clientes não-browser.
6. Aprovar invalidação dos JWTs legados.

## Limites
Nenhum segredo em Git; nenhuma alteração em contas/banco reais; nenhuma invalidação de sessões atuais nesta fase; sem deploy, merge ou migração sem autorização. Logout local não equivale a revogação.
