# Gate de validação do staging — NexusDev 2.0

**Data da verificação:** 2026-11-21  
**Branch:** `rebuild/v2-security`  
**Escopo:** somente staging; nenhuma alteração em produção.

## 1. CI

- Backend commit `40cec9d2157f5c5b095fb1d0943a2de363564f38`: concluído com sucesso (último commit auditado).
- Execução mais recente: https://github.com/nexusdevvcontato-web/NexusDev/actions/runs/44891046991
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


## 7. Rechecagem operacional do Atlas — 2026-11-21

- Cluster `NexusDevStaging`: estado `IDLE`, tipo `FREE`, região `SA_EAST_1`, MongoDB `8.0.39`.
- Access List do projeto contém exatamente `74.220.48.0/24` e `74.220.56.0/24`, ambas descritas como faixas de saída do Render staging. Nenhuma regra `0.0.0.0/0` foi encontrada na Access List do Atlas.
- O serviço Render tem ingress público (`0.0.0.0/0`) para servir o endpoint HTTP; isso é distinto da Access List do Atlas e não foi alterado.
- Atlas reportou zero alertas abertos na consulta realizada.
- Foram encontrados dois usuários de banco: `nexusdev_staging_app` e `nexusdev_staging_app_v2`. Ambos têm somente `readWrite` em `nexusdev_staging` e escopo no cluster `NexusDevStaging`.
- Não é possível determinar, pela listagem de usuários, qual credencial está atualmente referenciada pelo Render. Nenhum usuário foi removido ou modificado; a duplicidade permanece como item de reconciliação operacional, sem impacto presumido.
- Não foram consultados documentos de usuários nem exibidos valores de credenciais.


## 8. Rechecagem final de CI e eventos Render — 2026-11-21

Após a atualização documental anterior, os três commits mais recentes foram validados integralmente pelo workflow backend:

- `f310927f159bd9e0fa6f85b37c7a1c0f0f945323`: CI [44891159208](https://github.com/nexusdevvcontato-web/NexusDev/actions/runs/44891159208) — success.
- `d750ee04dc95487e37a6ee152e0c335f5412cfcc`: CI [44891161437](https://github.com/nexusdevvcontato-web/NexusDev/actions/runs/44891161437) — success.
- `ac68c06960d588588f71dbacb0999ff49ca4c3a4`: CI [44891164622](https://github.com/nexusdevvcontato-web/NexusDev/actions/runs/44891164622) — success.

Em todas as três execuções, instalação, auditoria de dependências, inicialização do replica set MongoDB descartável, inicialização do replica set, testes de sintaxe/segurança e limpeza terminaram com sucesso.

A releitura dos eventos Render confirmou que o deploy live mais recente observado (`dep-dc0drlafngtc738r83eg`) terminou com sucesso em 2026-11-20 23:55 UTC. O histórico também contém uma tentativa de deploy anterior com saída não zero, seguida por builds/deploys posteriores bem-sucedidos; portanto, o evento antigo não representa o estado atual, mas fica registrado como histórico. O serviço continua Free, não suspenso, na branch de staging, com auto deploy desligado e health check `/api/health`.

A rechecagem do Atlas confirmou cluster `IDLE`, MongoDB `8.0.39`, zero alertas abertos. Nenhum índice, usuário, documento, secret ou configuração foi alterado nesta rechecagem.

## 9. Estado do gate após as três execuções

**Concluído:** CI backend verde para os três commits documentais mais recentes; Render staging operacional segundo metadata e último deploy; cluster Atlas operacional e sem alertas abertos.

**Ainda bloqueado/inconclusivo:** jornada autenticada end-to-end no Render; navegação autenticada real no Preview protegido; confirmação das opções live `unique`/TTL dos índices; identificação segura do usuário Atlas efetivamente usado pelo Render; configuração OAuth/Gmail de recuperação; decisões de produto/jurídicas sobre certificados e comentários legados.

Este gate continua sendo uma validação de staging, não autorização nem certificação para produção.

## 10. Hardening adicional da recuperação de senha — 2026-11-21

A revisão do fluxo de recuperação identificou uma condição de corrida operacional: o serviço enviava o e-mail de redefinição sem verificar se o digest do token havia sido efetivamente persistido no documento do usuário. O serviço agora exige matchedCount igual a 1 antes de enviar a mensagem; se a conta deixar de existir entre a leitura e a gravação, a resposta permanece genérica e nenhum link é enviado.

Também foi antecipado o cabeçalho Cache-Control: no-store para antes dos limitadores dos endpoints de solicitação e confirmação, de modo que respostas de rate limit também recebam a política de não armazenamento.

**Cobertura adicionada:**
- teste de conta removida entre consulta e persistência, verificando que nenhum e-mail é enviado;
- testes de serviço atualizados para refletir o resultado real de updateOne;
- suite completa executada com MongoDB replica set descartável.

**Evidência final:**
- commit: 8162b5c57499ee0c3584fc89257bc949583bcd28
- CI: https://github.com/nexusdevvcontato-web/NexusDev/actions/runs/44892957349 — success.
- auditoria de dependências, inicialização do MongoDB, testes de sintaxe/segurança e limpeza: concluídos com sucesso.

Os commits intermediários desta sequência tiveram execuções de CI com falhas nos testes do novo mock de persistência; a cobertura foi corrigida e o commit final acima passou integralmente. Nenhum deploy foi iniciado. Nenhum secret, dado real, usuário Atlas, índice ou recurso de produção foi alterado.