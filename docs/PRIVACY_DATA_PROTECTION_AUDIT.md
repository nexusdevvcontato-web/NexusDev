# Auditoria de privacidade e proteção de dados

## Inventário observado no backend

O documento de usuário armazena:
- Identificação: nome, e-mail, avatar e identidade Google vinculada.
- Autenticação: hash de senha e identificador Google. Nunca devem ser enviados em respostas públicas ou exportações comuns.
- Aprendizagem: XP, sequência, data da última atividade, IDs de aulas concluídas e código salvo por aula.
- Certificado/portfólio: código, data de emissão e URLs GitHub/portfólio.
- Auditoria temporal: `createdAt` e `updatedAt`.

Comentários persistidos contêm ID da aula, nome público do autor, badge, texto e timestamps. Novos comentários também armazenam `authorUserId`, referência estável à conta autenticada. Comentários históricos continuam sem essa referência; não é seguro inferir o proprietário pelo nome público.

## Alterações implementadas nesta etapa

### Exportação de dados
- Adicionado `GET /api/privacy/export`, protegido por autenticação.
- A resposta usa allowlist explícita dos dados pertencentes à conta autenticada.
- Inclui dados de perfil, aprendizagem, código salvo, certificado/portfólio, timestamps e comentários vinculados à conta.
- Exclui `passwordHash`, `googleId`, `__v` e qualquer campo não incluído explicitamente na allowlist.
- A consulta de comentários é filtrada pelo `_id` autenticado no servidor (`authorUserId`), ordenada cronologicamente e seleciona somente os campos necessários.
- O JSON usa `schemaVersion: 2` e uma lista `comments` com ID, aula, autor público, badge, texto e timestamps; não expõe `authorUserId` nem campos internos.
- A resposta define `Content-Disposition` para JSON e `Cache-Control: no-store`.

### Minimização do JWT
- O JWT de acesso agora contém somente o identificador interno `id`.
- E-mail e papel foram removidos das claims porque o middleware de autenticação recarrega o usuário persistido no MongoDB em cada requisição e não depende dessas claims.
- O hash de senha e o identificador Google nunca são colocados no token.

### Vínculo de autoria em comentários
- O schema de comentários agora aceita `authorUserId` como referência ao usuário, com índice para futuras consultas por titular.
- A rota autenticada de criação grava o `_id` da conta validada pelo middleware; o cliente não pode escolher esse identificador.
- A leitura pública mantém o mesmo formato de resposta e não expõe o ID interno.
- Comentários antigos permanecem válidos com `authorUserId: null`/ausente. Nenhuma associação retroativa foi feita.
- Os comentários associados por `authorUserId` agora entram na exportação da própria conta. Comentários históricos sem vínculo não são atribuídos nem exportados, pois sua autoria não pode ser provada com segurança.

## Dados divulgados publicamente hoje

- **Leaderboard:** nome, avatar, XP, sequência e total de aulas concluídas.
- **Certificado:** nome, código, total de aulas, XP, data de emissão e URLs de portfólio. O código funciona como identificador público compartilhável; qualquer pessoa que o possua pode consultar esses campos.
- **Comentários:** nome público, badge, data e texto.

Esses dados são divulgados por funcionalidades públicas existentes. Esta etapa não alterou esse contrato para evitar invalidar certificados já emitidos ou quebrar a experiência do ranking/fórum. Antes de ampliar a divulgação, recomenda-se consentimento granular para presença no ranking e para os campos exibidos na validação do certificado.

## Exclusão e retenção: decisões ainda pendentes

Não foi criado endpoint de exclusão automática nesta etapa. O modelo atual não possui vínculo entre comentários e conta, nem política definida para:
- exclusão ou anonimização de comentários após encerramento da conta;
- revogação de certificados públicos e tratamento de cópias já compartilhadas;
- prazo de retenção de código salvo, logs e contas inativas;
- preservação mínima de registros por obrigações legais/segurança;
- tratamento de contas com certificados já emitidos.

Implementar exclusão sem resolver essas regras poderia deixar dados pessoais órfãos ou apagar conteúdo de terceiros. A referência estável `authorUserId` já é gravada nos novos comentários. O tratamento dos comentários antigos continua pendente e exige uma decisão explícita: mantê-los, solicitar confirmação individual de autoria ou aplicar outra política que não dependa apenas de nomes.

## Limitações e validação

- A exportação cobre os campos permitidos do documento de usuário e os comentários que possuem vínculo verificável por `authorUserId`; não inclui logs de infraestrutura, registros de provedores externos ou comentários históricos sem vínculo.
- Os testes unitários verificam a allowlist e a exclusão de segredos; não substituem teste HTTP integrado nem revisão jurídica.
- Não foi acessado banco real, não houve exportação de dados de usuários reais, migração, exclusão, deploy ou alteração de produção.


## Preferências de visibilidade e consentimento

- Adicionado `privacyPreferences` ao documento de usuário, com `showInLeaderboard` e `showCertificateDetails`.
- Contas legadas e contas sem valor explícito mantêm temporariamente o comportamento público anterior (`true`) para evitar remoção inesperada de perfis do ranking ou invalidação de validações de certificados já compartilhados. A pessoa pode optar por ocultar cada categoria individualmente.
- `GET/PUT /api/privacy/preferences` são autenticados. O PUT aceita somente as duas propriedades booleanas permitidas e atualiza apenas os campos enviados.
- O ranking exclui contas com `showInLeaderboard: false` e preserva registros legados sem a propriedade.
- A validação pública de um certificado continua confirmando sua autenticidade quando `showCertificateDetails: false`; nesse caso, retorna somente o código e `publicDetails: false`, sem nome, XP, progresso, data ou links.
- As preferências entram na exportação de dados pessoais. Não há migração em massa nem alteração de produção.
- A escolha padrão `true` é uma medida de compatibilidade para contas existentes, não uma comprovação de consentimento jurídico; a política e os textos de consentimento devem ser revisados antes de produção.


## Política de retenção e encerramento de conta

- A proposta técnica está em `docs/PRIVACY_RETENTION_AND_DELETION_POLICY.md` e documenta categorias de dados, tratamento proposto, certificados, comentários legados, backups e decisões ainda pendentes.
- `src/modules/privacy/deletion-readiness.js` fornece uma barreira fail-closed reutilizável: só considera o fluxo pronto quando reautenticação, janela de cancelamento, política de retenção, ciclo de backups, trilha de auditoria, execução transacional e decisões de certificados/comentários estiverem explicitamente configurados.
- Essa função não apaga nem altera dados e ainda não está ligada a uma rota. Nenhum endpoint de exclusão foi criado.
- Não foram definidos prazos numéricos de retenção sem base operacional/jurídica, e nenhum job automático de limpeza foi criado.


## Revisão complementar — exposição pública e cache

- A consulta pública de certificado agora usa projeção explícita dos campos necessários à resposta, em vez de carregar o documento completo do usuário.
- A rota pública do ranking e a rota autenticada de emissão de certificado enviam Cache-Control: no-store, assim como já ocorre na consulta pública de certificado e na leitura de comentários.
- A resposta pública de certificado respeita showCertificateDetails=false: mantém apenas a validade e o código, sem nome, XP, progresso ou links.
- Os testes HTTP de integração verificam cabeçalhos no-store do ranking, da emissão e da consulta de certificado, além da ocultação dos campos pessoais.
- O conteúdo de comentários permanece público por decisão funcional atual. A remoção/anonimização por titular não foi ativada porque ainda falta decisão de produto entre remoção e anonimização, e não há política aprovada para comentários legados sem authorUserId.
- Nenhuma conta, comentário ou certificado existente foi alterado por esta revisão.
