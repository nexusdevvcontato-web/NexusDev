# ADR: armazenamento de artefatos de aprendizagem

- Status: proposta técnica; ainda não aprovada para migração de dados
- Escopo: `savedDraftMap` e `savedCodeMap` no documento `User`
- Branch de trabalho: `rebuild/v2-security`

## Contexto atual

O schema `User` declara ambos os campos como `mongoose.Schema.Types.Mixed` com valor padrão `{}`. Isso mantém todos os artefatos de uma conta dentro de um único documento MongoDB.

Os rascunhos de aula têm validação por arquivo (até 10 arquivos, 50 KiB por arquivo) e por rascunho (40 KiB no total). O serviço grava em `savedDraftMap.<lessonId>` usando comparação atômica de revisão e escopo pelo `_id` do usuário autenticado. A leitura passou a projetar somente `savedDraftMap.<lessonId>`.

Esses limites protegem cada rascunho, mas não limitam o tamanho agregado dos mapas. O limite BSON de 16 MiB aplica-se ao documento inteiro, não individualmente a cada propriedade. Assim, vários rascunhos pequenos podem fazer o documento `User` crescer até impedir atualizações de perfil, progresso ou autenticação que precisem gravar no mesmo documento.

## Decisão proposta

Mover os artefatos para documentos próprios, em coleção dedicada, com um documento por usuário, aula e tipo de artefato. Exemplo conceitual:

- `userId`: ObjectId obrigatório, indexado
- `lessonId`: identificador do currículo, validado no servidor
- `kind`: enumeração fechada (`draft` ou `saved_code`)
- `files`: objeto validado pelo mesmo contrato de arquivos
- `revision`: inteiro seguro para compare-and-swap
- `createdAt` / `updatedAt`: timestamps

Índice único composto: `{ userId: 1, lessonId: 1, kind: 1 }`. Toda leitura, atualização e remoção deve incluir `userId` derivado da sessão autenticada. Nunca aceitar proprietário do corpo/URL como autoridade.

O índice composto evita duplicatas por proprietário/aula/tipo e a separação elimina o crescimento ilimitado do documento `User` causado por esses mapas. O tamanho máximo de cada documento deve ser validado no servidor com margem para metadados BSON; o limite atual de 40 KiB por rascunho é conservador para esse objetivo.

## Compatibilidade e migração

A migração deve ser uma operação separada, idempotente e observável:

1. Inventariar apenas contagens e tamanhos agregados, sem registrar conteúdo de código.
2. Executar dry-run para detectar formatos inesperados, aulas desconhecidas, documentos que excedam limites e colisões.
3. Copiar cada entrada válida com chave determinística `(userId, lessonId, kind)`; não sobrescrever uma entrada de destino mais recente.
4. Verificar contagens, revisões e hashes calculados em memória; nunca imprimir arquivos ou segredos nos logs.
5. Manter leitura compatível com o formato legado durante a janela de transição.
6. Habilitar gravação dupla ou um corte coordenado que impeça atualizações concorrentes perdidas.
7. Fazer leitura de verificação e monitorar erros antes de parar de consultar os mapas legados.
8. Remover os campos legados somente em uma mudança posterior, após backup, reconciliação e aprovação explícita.

Não executar a migração automaticamente na inicialização da aplicação, em deploy, nem contra produção. A execução requer backup verificável, plano de rollback, janela operacional e confirmação do responsável.

## Contratos que precisam acompanhar a mudança

- Exportação de privacidade: agregar os artefatos do usuário autenticado a partir da coleção nova, preservando o formato de exportação existente e sem expor IDs internos ou artefatos de terceiros.
- Inventário de impacto de exclusão: contar artefatos associados ao usuário; a execução de exclusão continua desabilitada até decisão de produto/política.
- Perfil/API: decidir se `savedCodeMap` continua no payload do perfil ou passa a ser obtido por endpoint paginado/específico. Evitar carregar todos os arquivos no login.
- Limites: manter limites de entrada, adicionar limites por usuário somente após decisão explícita de produto; não inventar quota de armazenamento.
- Observabilidade: métricas de quantidade/tamanho e falhas, sem conteúdo dos arquivos.

## Riscos e salvaguardas

- Migração parcial: manter fonte legada e destino reconciliáveis até validação completa.
- Escritas concorrentes: usar compare-and-swap por revisão e estratégia de corte que evite dual-write inconsistente.
- Isolamento entre contas: todas as queries usam `userId` da sessão; testes com duas contas e mesma aula/revisão.
- Exportação incompleta: testes verificam que todos os artefatos do proprietário aparecem uma vez e nenhum de outro usuário aparece.
- Exclusão acidental: não remover mapas nem documentos durante esta etapa.

## Estado desta etapa

A coleção/modelo e o serviço isolado foram implementados em código, com testes unitários e integração em MongoDB descartável. O modelo desabilita criação automática de índices; o teste de integração cria os índices explicitamente somente no MongoDB descartável. O planejador de migração transforma os mapas legados em registros candidatos, valida os IDs contra o catálogo e registra apenas motivos de rejeição, sem incluir código-fonte nos diagnósticos.

Também existe `scripts/plan-learning-artifact-migration.js`, um inventário *dry-run* estritamente read-only. Ele aceita somente `MONGO_SESSION_TEST_URI` apontando para `127.0.0.1`, `localhost` ou `::1`, banco `nexusdev_session_test` e replica set `rs0`. Não possui modo de gravação; `--apply` é explicitamente recusado. Sua saída contém apenas contagens, motivos de rejeição e estimativa agregada de bytes, nunca conteúdo dos arquivos ou IDs de usuários.

A exportação de privacidade agora consulta artefatos novos com filtro pelo `userId` autenticado e os apresenta no mesmo formato legado (`savedDraftMap`/`savedCodeMap`), preservando o contrato existente. O inventário read-only de impacto também conta os artefatos do proprietário. Testes HTTP usam duas contas sintéticas e confirmam que os arquivos e contagens de uma conta não aparecem para a outra.

Nenhum documento real de usuário foi lido, migrado, alterado ou removido durante esta etapa. Nenhum índice foi criado em Atlas. Foi adicionado `src/modules/drafts/transactional-lesson-drafts.js` como serviço de transição ainda não conectado às rotas. Ele lê primeiro o artefato novo e recorre ao mapa legado quando não existe registro novo; nas gravações, executa em uma transação MongoDB o compare-and-swap do mapa legado e a gravação do artefato, mantendo o formato legado sincronizado para versões antigas. Se a gravação do artefato falhar, a transação é abortada para impedir que apenas o espelho legado seja confirmado. Conflitos de revisão retornam o estado atual. O serviço depende do índice único `{ userId: 1, lessonId: 1, kind: 1 }` já existente antes de ser habilitado.

Os testes de integração no replica set descartável agora cobrem leitura inicial do legado, primeira gravação sincronizada, revisão obsoleta, dois escritores simultâneos na primeira gravação, isolamento entre proprietários e rollback quando a gravação do artefato falha. Esses testes usam apenas contas sintéticas.

As rotas de gravação e conclusão de aula continuam usando o armazenamento legado; o novo serviço ainda não foi conectado, não há cutover nem migração efetiva. A habilitação continua bloqueada até confirmar o índice único no staging, revisar o plano de rollback e executar testes de integração no staging sem dados reais. Migração de dados continua bloqueada até backup verificável, revisão do dry-run e aprovação operacional explícita.
