# Sincronização de rascunhos de aulas

## Escopo

A sincronização guarda somente rascunhos de código por usuário e por aula. Ela não concede XP, não marca aulas como concluídas e não substitui a prova assinada exigida pelo endpoint de conclusão.

## API

- GET /api/lessons/:lessonId/draft — retorna a revisão e os arquivos do rascunho do usuário autenticado.
- PUT /api/lessons/:lessonId/draft — salva arquivos se expectedRevision corresponder à revisão atual.

O identificador do usuário vem exclusivamente da sessão autenticada. Nenhuma rota aceita um userId fornecido pelo cliente.

## Concorrência

Cada salvamento incrementa uma revisão. O banco aplica uma comparação atômica da revisão esperada. Se outro dispositivo já salvou uma versão, a API retorna HTTP 409 e a revisão mais recente. O cliente deve pedir uma escolha explícita entre carregar a versão da nuvem ou substituir a versão da nuvem pela versão local.

Não há mesclagem automática de arquivos, pois uma mesclagem textual sem conhecimento da linguagem pode corromper código.

## Limites

- IDs de aula precisam pertencer ao catálogo oficial.
- 1 a 10 arquivos por rascunho.
- Até 50 KiB por arquivo.
- Até 40 KiB no total, mantendo o JSON serializado abaixo do limite global de 100 KiB mesmo com escape de aspas e barras invertidas.
- Nomes de arquivos restritos a caracteres alfanuméricos, ponto, sublinhado e hífen.
- Conteúdo textual; bytes nulos e caracteres de controle não imprimíveis são rejeitados.
- Respostas usam Cache-Control: no-store.
- Limite de 60 operações por minuto por IP, além do limitador global.

## Privacidade e retenção

Os rascunhos são armazenados no documento do próprio usuário em savedDraftMap, não são incluídos em respostas públicas e fazem parte da exportação de dados pessoais e do inventário de dados de aprendizagem. A exclusão automática de contas continua desabilitada até aprovação da política de retenção e dos demais bloqueios documentados.

## Validação pendente

A suíte automatizada cobre validação de arquivos, controle otimista de revisão, conflito de escritor obsoleto e exportação. Ainda é necessário testar manualmente dois navegadores/dispositivos autenticados em staging, com uma conta sintética descartável, antes de considerar a sincronização operacionalmente validada.
