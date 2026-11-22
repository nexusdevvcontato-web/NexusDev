# Matriz de cobertura da exportação de dados pessoais

**Status:** auditoria técnica da branch `rebuild/v2-security`; não é parecer jurídico.
**Escopo:** campos persistidos no schema `User`, comentários vinculados, sessões e registros auxiliares de autenticação/progresso.

## Dados do perfil exportados

A allowlist de `src/modules/privacy/user-export.js` cobre os campos de perfil e aprendizagem persistidos no schema de usuário:

| Categoria | Campos exportados |
|---|---|
| Identidade de perfil | `id`, `name`, `email`, `avatar`, `role` |
| Aprendizagem | `xp`, `streak`, `lastActiveDate`, `completedIds` |
| Conteúdo salvo | `savedCodeMap`, `savedDraftMap` |
| Certificado | `certificateCode`, `certificateIssuedAt`, `certificateStudentName`, `certificateCompletedCount`, `certificateXp`, `certificateGithubUrl`, `certificateLiveUrl` |
| Perfil público | `githubUrl`, `liveUrl` |
| Preferências e datas | `privacyPreferences`, `createdAt`, `updatedAt` |

Os testes unitários agora comparam o conjunto exato de chaves exportadas com essa allowlist, incluindo dados de rascunhos, e verificam que campos internos de autenticação não aparecem.

## Dados relacionados exportados

- **Comentários:** somente documentos cujo `authorUserId` corresponde ao usuário autenticado; campos exportados: ID, aula, autor público, badge, texto e datas.
- **Sessões:** somente sessões do usuário autenticado; exporta ID e metadados de criação, último uso, expiração e revogação.
- **Cache:** resposta com `Cache-Control: no-store`; arquivo JSON com `Content-Disposition: attachment`.
- **Autorização:** sessão autenticada mais prova recente de reautenticação, vinculada ao usuário e consumida uma única vez. O endpoint não aceita ID de titular fornecido pelo cliente.

## Campos deliberadamente excluídos

| Campos/registro | Motivo técnico |
|---|---|
| `passwordHash` | Verificador de credencial; nunca deve sair do servidor. |
| `passwordResetTokenHash`, `passwordResetExpiresAt` | Estado interno de recuperação e material de segurança. |
| `googleId` | Identificador interno do provedor; a resposta não expõe o identificador de identidade Google. |
| `reauthProofHash`, `reauthProofExpiresAt` | Prova interna temporária de reautenticação. |
| `authVersion` | Contador interno de invalidação de credenciais/sessões. |
| `passwordChangedAt` | Metadado interno de segurança, atualmente não incluído na allowlist. Reavaliar se o produto quiser disponibilizar histórico de segurança ao titular. |
| `Session.csrfTokenHash`, `RefreshToken.tokenHash`, `RefreshToken.csrfTokenHash` | Hashes de credenciais e proteção CSRF; não são exportados. |
| `CompletionProof.jti`, `filesHash` e demais registros anti-replay | Artefatos técnicos de validação/consumo de comprovantes. O progresso do titular é representado por `completedIds`; não exportar JTI ou hash de arquivos. |
| `__v` e campos não reconhecidos | Metadados internos do Mongoose ou campos futuros/inesperados; a allowlist impede exposição acidental. |

A exclusão de credenciais e de artefatos anti-replay é intencional. Isso não deve ser confundido com omissão de progresso: `completedIds`, XP e os conteúdos salvos são exportados.

## Limitações e decisões pendentes

1. **Comentários legados:** comentários sem `authorUserId` não podem ser atribuídos com segurança e não entram na exportação. Não tentar associá-los por nome, badge ou semelhança textual. A política para reivindicação desses comentários continua pendente.
2. **Dados externos:** logs de Render/Vercel, MongoDB Atlas, Google e backups não são reunidos pelo endpoint. A exportação não afirma incluir esses registros.
3. **Histórico de segurança:** `passwordChangedAt` é persistido com seleção padrão desabilitada e não é incluído na exportação atual. Sua disponibilização como informação de segurança ao titular requer decisão de produto e implementação/teste específico.
4. **Certificado:** o snapshot do certificado é exportado, mas a política de revogação ou preservação após encerramento da conta continua pendente. Exportar o certificado não decide essa política.

## Conclusão

A allowlist atual cobre todos os campos de perfil, aprendizagem, rascunhos, preferências e snapshot do certificado definidos no schema `User`. Os campos de autenticação e controle interno permanecem excluídos. A cobertura não equivale a um pacote completo de dados mantidos por provedores externos nem resolve comentários legados ou decisões de retenção.

Nenhum documento real foi consultado ou alterado nesta auditoria. A validação automatizada usa fixtures sintéticos e o banco descartável de CI.
