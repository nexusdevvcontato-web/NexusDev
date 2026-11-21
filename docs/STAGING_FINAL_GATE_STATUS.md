# Gate de validação do staging — NexusDev 2.0

**Data da verificação:** 2026-11-21  
**Branch:** `rebuild/v2-security`  
**Escopo:** somente staging; nenhuma alteração em produção.

## 1. CI

- Backend commit `d43df0ad75ed41155fcdf51727c893af890e7a0e`: concluído com sucesso.
- Execução mais recente: https://github.com/nexusdevvcontato-web/NexusDev/actions/runs/44890638522
- Commit anterior `43ff149ca72bbf641b84a3c1c55c259d1e4cbd27` também passou: https://github.com/nexusdevvcontato-web/NexusDev/actions/runs/44890609835
- Ambas as execuções completaram auditoria de dependências, MongoDB replica set descartável e testes de sintaxe/segurança.
- O CI valida o conjunto automatizado do repositório, incluindo testes com MongoDB descartável. Não substitui a jornada autenticada no serviço Render real.

## 2. Render staging

Releitura do serviço `nexusdev-staging-v2`:
- Branch: `rebuild/v2-security`
- Plano: Free
- Estado: não suspenso
- Auto deploy: desativado
- Trigger: off
- Health check configurado: `/api/health`
- URL: https://nexusdev-staging-v2.onrender.com
- Revalidação via Preview Vercel: `/api/health` respondeu HTTP 200 com JSON `status: online`, serviço `NexusDev API v2.0` e cabeçalho `x-render-origin-server: Render`, confirmando o encaminhamento para o Render staging. Isso não substitui testes autenticados.

Não foi solicitado nem iniciado deploy. A consulta recente de logs do Render falhou com HTTP 503 do serviço de logs (Loki indisponível); portanto, esta rodada não usa logs como evidência de ausência de erros.

## 3. Atlas — comparação entre schema versionado e inventário live

O inventário live confirmou os nomes e as chaves dos índices abaixo. O conector de inspeção retorna `name` e `key`, mas não retorna opções `unique`, `sparse` ou `expireAfterSeconds`. Assim, as opções foram comparadas ao schema versionado, mas **não estão confirmadas no catálogo live**.

| Coleção | Índices live relevantes | Opções exigidas pelo schema versionado |
|---|---|---|
| users | `email_1`, `certificateCode_1` | email unique; certificateCode unique + sparse |
| sessions | `familyId_1`, `expiresAt_1` | familyId unique; expiresAt TTL 0 |
| refreshtokens | `tokenHash_1`, `expiresAt_1` | tokenHash unique; expiresAt TTL 0 |
| completionproofs | `jti_1`, `expiresAt_1` | jti unique; expiresAt TTL 0 |
| comments | `lessonId_1`, `authorUserId_1` | índices comuns de consulta |

Referências do schema:
- `server.js`: `email` unique e `certificateCode` unique/sparse.
- `src/modules/auth/session-models.js`: `familyId` unique, `tokenHash` unique e TTL em `expiresAt` para sessões e refresh tokens.
- `src/modules/proofs/completion-proof-store.js`: `jti` unique e TTL em `expiresAt`.

Nenhum índice foi criado, removido ou alterado. Não foram lidos documentos de usuários.

## 4. Limites de validação autenticada

Ainda não foi concluída uma jornada end-to-end com contas sintéticas no serviço Render:
- registro/login de conta descartável;
- reautenticação por senha e por Google;
- exportação com prova de reautenticação;
- rejeição de prova ausente, expirada, reutilizada ou de outro usuário;
- inspeção final de logs sem segredos.

O Preview da Vercel permanece protegido por autenticação da plataforma. Não foi desativada proteção nem criado acesso compartilhável adicional nesta rodada. A recuperação por Gmail também continua sem credenciais OAuth operacionais confirmadas.

## 5. Próximos gates

1. Executar a jornada autenticada de staging com conta local descartável e validar Google somente quando houver OAuth de staging funcional.
2. Obter evidência das opções reais de índices TTL/unique por uma interface administrativa suportada que exponha essas opções; não inferir opções pelo nome do índice.
3. Concluir testes de UI autenticados no Preview.
4. Resolver as decisões de produto/jurídicas sobre certificados e comentários legados antes de implementar exclusão definitiva.
5. Emitir avaliação final de prontidão. Este documento não declara produção pronta.

## 6. Segurança operacional

- Produção não foi acessada nem alterada.
- Nenhum dado real foi lido ou copiado.
- Nenhum índice ou documento foi modificado.
- Nenhum secret foi exibido ou alterado.
- Runner e XP autoritativo permanecem desabilitados.
- Serviço Render staging continua com auto deploy desligado.
