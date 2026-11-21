# Auditoria de compatibilidade: currículo x executor

Data: 2026-11-19  
Branch auditada: `rebuild/v2-security`  
Frontend: `nexusdev-frontend/src/App.jsx`  
Executor: `NexusDev/runner/src/challenge-registry.js`, `evaluator.js`, `html-evaluator.js`, `js-evaluator.js`

## Escopo e regra de decisão

Foram comparados os 26 desafios explicitamente registrados no `CHALLENGE_SPECS` com os exercícios correspondentes no currículo do frontend e com o comportamento efetivamente implementado pelos avaliadores.

**Compatível** significa que o tipo de teste e a linguagem necessária estão implementados. **Parcial** significa que há critérios incompletos ou divergência entre o enunciado e o teste. **Bloqueado** significa que a facade/avaliador atual rejeita a especificação ou não consegue avaliar o formato pedido.

Esta auditoria é estática; não substitui testes de execução para cada solução-modelo.

## Matriz dos 26 desafios

| ID | Currículo / requisito principal | Spec atual | Estado | Motivo / ação necessária |
|---|---|---|---|---|
| `html-00-o-que-e-web` | Criar título principal “Olá, Mundo!” | `selector-exists`, `text-includes` | Compatível | Verifica elemento e texto. |
| `html-01-subtitulo-h2` | Manter h1 e adicionar h2 “Sobre Mim” | h1 e h2/texto | Compatível | Critérios correspondem ao enunciado. |
| `html-02-paragrafo-p` | Criar parágrafo | presença e texto mínimo | Compatível | O teste exige pelo menos 5 caracteres; confirmar esse mínimo no enunciado final. |
| `html-03-negrito-strong` | Usar strong dentro de parágrafo | presença de p e texto em p strong | Compatível | Critérios estruturais correspondem ao objetivo. |
| `html-04-lista-ul-li` | Criar lista com itens | ul e mínimo 3 li | Compatível | Confirmar que o enunciado exige pelo menos três itens. |
| `html-05-botao-clicavel` | Botão clicável “Começar Agora” | presença de button e texto | Parcial | O teste não verifica comportamento de clique; não comprova que o botão seja funcional. |
| `js-01-variaveis-calculo` | Função de desconto | function-cases | Compatível | Casos aritméticos cobertos pelo subconjunto JS. |
| `js-02-condicionais-frete` | Condicional e operador lógico | function-cases | Compatível | If/else, comparações e lógica booleana são suportados. |
| `js-03-arrays-soma` | Somar array, inclusive vazio | function-cases | Compatível com ressalva | O avaliador suporta reduce com acumulador inicial; laços tradicionais não são suportados. O enunciado/hint deve ensinar uma forma suportada ou o avaliador deve evoluir. |
| `mod-2-aula-4` | Média segura, array vazio | function-cases | Compatível com ressalva | Pode ser implementado com reduce e inicializador; solução com loop sugerida pelo hint não é suportada. |
| `mod-2-aula-5` | trim e toLowerCase | function-cases | Compatível | `trim()` e `toLowerCase()` estão na allowlist restrita. |
| `mod-2-aula-6` | split com espaços/regex | function-cases | Compatível com ressalva | `split()` aceita separador literal e apenas a regex fixa `/\\s+/`; outros padrões regex são rejeitados. |
| `mod-3-aula-2` | Retornar objeto de props | function-deep-equals | Compatível | Construção de objetos, leitura de propriedades e comparação profunda são suportadas. |
| `mod-3-aula-3` | Atualizar preço sem mutar | deep-equals e does-not-mutate-input | Compatível com ressalva | `map()` e spread de objeto suportam o padrão de atualização imutável registrado; sem mutadores arbitrários. |
| `mod-3-aula-4` | Filtrar produtos | function-deep-equals | Compatível | `filter()` com callback restrito e comparação profunda estão implementados. |
| `react-01-carrinho-imutavel` | Adicionar/incrementar item sem mutação | deep-equals e does-not-mutate-input | Compatível com ressalva | `some()`, `map()`, spread e comparação de objetos cobrem o padrão de carrinho da solução de referência; React/DOM não são executados. |
| `mod-4-aula-2` | Controller GET com resposta Express | http-controller-case | Compatível com ressalva | Mock local suporta `res.status()` e `res.json()`; não inicia Express nem acessa rede. |
| `mod-4-aula-3` | Validar produto | function-cases | Parcial | O formato de teste é reconhecido, mas trim e Number.isFinite não são suportados. |
| `mod-4-aula-4` | Sanitizar formato de erro | function-deep-equals | Compatível com ressalva | Construção condicional de objetos e comparação profunda estão cobertas; não implica suporte a sanitização geral ou bibliotecas externas. |
| `node-01-controller-produto` | Controller POST com req/res | http-controller-case | Compatível com ressalva | Casos de sucesso/erro avaliados com `req.body` e mock restrito de resposta. A facade ainda aceita somente o entrypoint registrado; arquivos auxiliares de rota não são avaliados. |
| `mod-5-aula-2` | Documento MongoDB com campos permitidos | deep-equals e does-not-mutate-input | Compatível com ressalva | Casos confiáveis verificam documento novo com somente `titulo`, `preco`, `categoria` e `ativo`, trim, categoria padrão, descarte de campos extras/operadores e imutabilidade; não persiste no MongoDB nem substitui validação de schema no servidor. |
| `mod-5-aula-3` | Atualização MongoDB com $set | deep-equals e does-not-mutate-input | Compatível com ressalva | Casos confiáveis verificam allowlist `titulo`/`preco`/`ativo`, normalização, tipos, preço finito positivo, imutabilidade e rejeição de repasse integral do body; não executa MongoDB nem valida operadores no servidor real. |
| `mod-5-aula-4` | Validar cadastro | function-cases | Parcial | Regex de e-mail e validações de string não são suportadas. |
| `mod-5-aula-5` | Política de senha com maiúscula/minúscula/número | function-cases | Bloqueado | Testes dependem de operações de string/regex ausentes. |
| `mod-5-aula-6` | Extrair Bearer token | function-cases | Bloqueado | Depende de regex/validação de string não suportadas. |
| `mod-5-aula-7` | RBAC | function-cases | Compatível com ressalva | Verifica igualdade exata entre role e perfil exigido, tipos/valores inválidos e rejeita o atalho `isAdmin` controlado pelo objeto recebido. O helper não autentica JWT nem garante que `usuario` veio de sessão confiável; o middleware de produção deve fornecer a identidade validada e consultar o perfil persistido. |

## Conclusões verificáveis

1. A facade aceita somente **um arquivo**, com nome idêntico ao `entrypoint` registrado. Isso conflita com os dois exercícios Express que apresentam mais de um arquivo no editor.
2. O HTML evaluator implementa os cinco tipos de teste declarados para HTML, mas a aula de botão promete comportamento que os testes estáticos não observam.
3. O JavaScript evaluator agora suporta `function-cases`, `function-deep-equals`, `does-not-mutate-input` e `http-controller-case` nos padrões explicitamente implementados. Controllers recebem apenas `req.body` e um mock `res` com `status()`/`json()`.
4. O desafio `mod-5-aula-3` avalia apenas a construção pura do objeto `$set`: campos desconhecidos e operadores recebidos (`$inc`, `$where`, `$unset`) não entram no resultado esperado. Propriedades perigosas (`__proto__`, `prototype`, `constructor`) são recusadas pelo sanitizador de entrada antes da avaliação. Isso não equivale a uma política MongoDB em produção nem a uma proteção de autorização no banco.\n5. A linguagem permanece intencionalmente limitada: métodos de string e arrays têm allowlists explícitas; somente `/\\s+/` é aceita como regex fixa em `split()`. Não há loops, chamadas arbitrárias, acesso à rede, Express real ou MongoDB.
6. A facade e os avaliadores permanecem protótipos internos; não estão integrados à API nem autorizam emissão de prova de conclusão.

## Plano de correção recomendado

### Fase A — precisão da especificação
- Ajustar o teste do botão para não prometer “clicável” sem um avaliador de comportamento; alternativamente, reescrever o objetivo como estruturação de botão.
- Alinhar hints e exemplos de arrays às construções atualmente suportadas, ou expandir o avaliador de forma controlada.
- Confirmar os requisitos de mínimo de texto e quantidade de itens nas aulas HTML.

### Fase B — capacidades do avaliador
- Implementar comparação estrutural profunda e verificação de não mutação usando cópias isoladas dos argumentos.
- Projetar testes declarativos seguros para controllers HTTP, com mocks limitados de req/res; nunca iniciar servidor nem fazer I/O.
- Expandir o subconjunto JS somente com operações explícitas, limites e testes adversariais. Não adicionar eval, Function, vm ou execução arbitrária.
- Definir um manifesto de múltiplos arquivos por desafio, validado por allowlist, em vez de aceitar arquivos extras genericamente.

### Fase C — validação por desafio
- Criar ao menos uma solução de referência por desafio.
- Executar solução correta, soluções incorretas e casos-limite/adversariais em CI.
- Manter bloqueado o XP/proof para qualquer desafio sem compatibilidade comprovada.

## Critério de liberação

Nenhum desafio deve emitir prova de conclusão até que: (a) a especificação corresponda ao enunciado; (b) a solução de referência passe todos os casos; (c) soluções inválidas falhem; (d) os limites e rejeições adversariais estejam testados; e (e) a execução ocorra no host isolado planejado. Esta matriz, por si só, não libera integração nem XP.

## Atualização — callbacks e imutabilidade (2026-11-19)

O avaliador JavaScript agora inclui suporte limitado a:
- `map()` e `filter()` em arrays, com callbacks de uma ou duas variáveis;
- callbacks com leitura lexical controlada dos parâmetros da função externa;
- spread de arrays somente a partir de arrays;
- spread de objetos somente a partir de objetos simples, copiando apenas propriedades próprias;
- propriedades shorthand em literais de objetos;
- limites de arrays, strings, profundidade e passos continuam aplicados.

A cobertura automatizada foi ampliada para:
- atualizar produtos com `map()` e spread de objeto sem mutação;
- copiar arrays com spread e reduzi-los;
- rejeitar chaves perigosas como `constructor`;
- manter `filter()` limitado aos casos confiáveis do registry.

Limitações mantidas:
- não há execução de JavaScript arbitrário nem de métodos arbitrários;
- spread em argumentos de chamadas continua proibido;
- métodos como `find()`, `some()`, `sort()`, mutadores de arrays e expressões regulares ainda não são suportados;
- o avaliador continua não sendo um sandbox de segurança e não está conectado ao serviço de execução/API.

A suíte completa e o CI ainda precisam ser confirmados antes de considerar esta etapa aprovada.


## Retificação da matriz após evolução do avaliador

A matriz acima foi originalmente escrita antes da implementação dos testes de comparação profunda, imutabilidade, normalização de strings, `map()`, `filter()` e spread restrito. As linhas indicadas foram atualizadas para refletir os recursos presentes no branch nesta revisão. A classificação continua sendo uma análise de compatibilidade estática; não equivale a execução da suíte nem a autorização para colocar o executor em produção.

`find()` e `some()` permanecem explicitamente fora da allowlist e agora possuem testes de rejeição. Regex, execução de DOM/React, APIs externas e execução de código arbitrário também permanecem indisponíveis.


## Atualização de compatibilidade por solução de referência (2026-11-20)

A solução de referência do currículo React para `react-01-carrinho-imutavel` usa `some()` para detectar item existente, `map()` para incrementar quantidade e spread para produzir cópias. O avaliador agora suporta esse padrão limitado e a suíte testa os dois caminhos (item novo e item existente), além de verificar não mutação.

A aula `mod-2-aula-6` usa `trim()` e divisão por whitespace. O avaliador permite somente a expressão regular literal `/\\s+/` em `split()`, sem flags e sem padrões controlados pelo aluno. Padrões arbitrários continuam rejeitados para evitar superfície de regex não limitada.

O frontend continua executando o código de aula no navegador durante a experiência de aprendizagem; este avaliador isolado é um caminho separado e ainda não substitui nem altera esse comportamento. Os testes de referência cobrem o subconjunto explicitamente registrado, não os 700 IDs do currículo.


## Atualização — controllers Express simulados (2026-11-20)

O avaliador agora reconhece o tipo declarativo `http-controller-case` para os dois desafios de controller registrados (`mod-4-aula-2` e `node-01-controller-produto`). O controller recebe:
- `req.body` como objeto de dados isolado, vindo exclusivamente dos casos de teste confiáveis;
- `res.status(code)`, limitado a códigos inteiros de 100 a 599;
- `res.json(body)`, que registra a resposta serializável para comparação.

Nenhum servidor Express é iniciado. O mock não oferece `send`, `redirect`, headers, cookies, sessão, parâmetros de rota, query string, middleware, banco ou rede. Chamadas a métodos não previstos são rejeitadas. Os testes exercitam o GET, POST válido, POST inválido e a rejeição de `res.send()`.

O CI do commit `762f479` concluiu com 88 testes aprovados e zero falhas. Isso confirma a suíte automatizada do branch, não a compatibilidade dos arquivos auxiliares do exercício Node nem a segurança de um ambiente de execução real.

**Estado atual substitui as observações históricas anteriores:** os dois desafios de controller deixam de estar totalmente bloqueados, mas permanecem com ressalvas de escopo. A facade continua exigindo exatamente um arquivo por desafio.


## Atualização — validação de cadastro e parsing de autenticação (2026-11-20)

O subconjunto JavaScript recebeu primitivas explícitas para quatro desafios:
- `mod-4-aula-3`: `String.trim()` e `Number.isFinite()` para validar título e preço.
- `mod-5-aula-4`: uma única expressão regular fixa para formato plausível de e-mail, além de limites de nome e senha.
- `mod-5-aula-5`: somente três padrões fixos para detectar maiúscula, minúscula e dígito; o tamanho permitido continua entre 8 e 128.
- `mod-5-aula-6`: parsing do esquema Bearer com comparação case-insensitive, exatamente um separador e rejeição de whitespace no token.

O avaliador não aceita padrões regex arbitrários, flags, construtores RegExp, métodos arbitrários ou execução de globals. `Number.isFinite` é uma exceção explicitamente tratada; o identificador global `Number` não é exposto ao programa.

Os casos confiáveis foram ampliados para limites de senha, tipos incorretos, campos ausentes, preço `Infinity`, cabeçalhos com espaços repetidos, tabulações e quebras de linha. Entradas não finitas só são admitidas como fixtures internas confiáveis para testar `Number.isFinite`; resultados não finitos continuam rejeitados pelo avaliador. O CI do commit `bf09448` (incluindo o caso de preço `Infinity`) concluiu com **93 testes aprovados e zero falhas**.

A classificação dos quatro desafios foi elevada para “Compatível com ressalva” no escopo do avaliador local. Isso não valida autenticação JWT real, não substitui `jwt.verify`, não faz hash de senha e não libera integração do runner, prova de conclusão ou XP.


## Backend authentication and authorization review

- Access tokens now use validated `JWT_EXPIRES_IN` (default `30d`, maximum `365d`) and explicit HS256 signing/verification.
- Bearer parsing rejects malformed headers, multiple tokens, and trailing authorization data.
- The auth middleware reloads the account from MongoDB for every authenticated request; the JWT role claim is not used for authorization.
- Current API routes do not expose a dedicated administrative action surface. Admin role currently changes the comment badge only; an RBAC middleware should be added before any privileged routes are introduced.
- Password reset/change and account recovery endpoints are not present. Do not assume these flows are supported.


## MongoDB integrity and ownership review (2026-11-20)

Static inspection of `server.js` found:

- Authenticated routes reload the account by the verified token subject; progress and certificate mutations target only `req.user._id`.
- No endpoint passes a request body directly to `User.update*`, `findOneAndUpdate`, or `save`; user mutations are assembled from explicit fields. Comment author and badge are derived from the persisted authenticated user, not caller-supplied fields.
- XP completion is guarded by `{ _id, completedIds: { $ne: challengeId } }` and `$addToSet` + `$inc` in one atomic update, preventing concurrent duplicate XP awards for one challenge (assuming normal MongoDB atomic single-document update semantics).
- Certificate generation now uses `crypto.randomBytes(10)` (80 bits) rather than `Math.random`. Public certificate and leaderboard completion counts now count unique IDs present in the trusted curriculum allowlist, not raw array length.
- Email and certificate fields declare unique/sparse unique indexes in the Mongoose schema. Whether those indexes exist in the actual database was not verifiable without connecting to it; confirm index creation/state before production use. No index migration or live DB operation was performed.
- Certificate validation intentionally exposes the student name, XP, issue date, and portfolio URLs to anyone holding the certificate code. Treat these as public certificate data; obtain user consent in the product UI before publishing portfolio links.
- Remaining data-integrity concerns: login/Google streak updates use read-modify-save and may lose increments under concurrent requests; streak semantics currently increment once per calendar date rather than verifying consecutive days. This should be corrected separately with an atomic update and explicit product rule.

Validation scope: code inspection and unit tests only. No real MongoDB instance, production data, index catalog, backups, migrations, or deployment were accessed.


## Concorrência e idempotência das operações de conta (2026-11-20)

- Login por senha e login Google existentes agora usam `recordDailyActivity` para incrementar `streak` e atualizar `lastActiveDate` em uma única operação condicional atômica (`lastActiveDate: { $ne: today }` + `$inc`/`$set`). Requisições simultâneas no mesmo dia não incrementam mais de uma vez. Se outra requisição já atualizou o dia, o helper recarrega o usuário.
- A rota de conclusão já incrementava a sequência por uma atualização condicional semelhante; o login agora segue o mesmo padrão.
- A emissão do certificado foi separada em `issueCertificateOnce`: a primeira chamada que encontra `certificateIssuedAt: null` define código e data em uma única atualização; chamadas concorrentes perdedoras recarregam e retornam o certificado já emitido, em vez de sobrescrever o identificador/data.
- O endpoint de emissão não salva mais o snapshot Mongoose inteiro de `req.user`. Campos opcionais de perfil são escritos explicitamente com `$set`, evitando sobrescrever progresso ou alterações concorrentes carregadas depois do middleware.
- A regra de produto existente permanece: `streak` conta dias distintos com atividade, mas não verifica continuidade entre dias consecutivos nem zera após ausência. Isso não foi alterado sem uma definição funcional explícita.

Testes unitários mockados verificam os filtros e updates atômicos, o caminho de concorrência em que a atualização já foi realizada e o caso de conta ausente. Eles não substituem testes de integração com MongoDB nem validam o estado dos índices no banco real.


## Atualização — integração da validação e suporte a arquivos auxiliares (2026-11-21)

Esta seção atualiza as conclusões antigas desta auditoria, que foram escritas antes da integração da avaliação à API.

### Estado atual da integração

- A rota autenticada `POST /api/progress/complete` chama `evaluateAndCreateCompletionProof`; a conclusão não depende de um JWT de runner externo.
- O backend avalia a submissão com testes e especificações mantidos no servidor. O navegador não envia testes, resultados esperados nem comprovantes.
- A gravação do comprovante, do código submetido, do ID de conclusão, do XP e da atividade diária ocorre dentro da mesma transação MongoDB.
- O identificador de comprovante é determinístico para usuário, aula e hash dos arquivos; a restrição única de `jti` impede reutilização idêntica. O incremento de XP é condicionado à aula ainda não constar em `completedIds`.
- A execução JavaScript continua sendo interpretação restrita de AST. Não usa `eval`, `Function`, `vm`, processo filho, rede ou execução arbitrária do código do aluno.

### Arquivos por aula

A regra anterior de “um único arquivo para todas as aulas” foi substituída por uma allowlist declarativa por aula:

- Por padrão, cada especificação aceita somente o seu `entrypoint`.
- Quando uma aula realmente usa arquivos auxiliares no editor, a especificação pode declarar `supportingFiles`.
- A validação exige o conjunto exato de nomes declarados; arquivos adicionais ou ausentes são rejeitados.
- Todos os arquivos aceitos entram no hash de integridade e são salvos no rascunho/progresso. Somente o `entrypoint` é interpretado; arquivos auxiliares não são executados.
- `mod-4-aula-2` e `node-01-controller-produto` declaram `produtoController.js` como entrypoint e `server.js` como arquivo auxiliar.

### Compatibilidade atual do currículo

- O currículo publicado contém 700 IDs de aula.
- Existem 26 especificações explícitas no registro confiável do executor. Somente essas aulas podem conceder XP oficial; as demais continuam disponíveis como conteúdo/atividade local, mas não recebem XP validado até ganharem especificação e testes revisados.
- As limitações apontadas anteriormente para `mod-4-aula-3` e `mod-5-aula-4`, `mod-5-aula-5` e `mod-5-aula-6` foram resolvidas no avaliador restrito atual: ele oferece `trim`, `Number.isFinite`, e padrões regex fixos e limitados para os casos dessas aulas.
- A linguagem continua intencionalmente incompleta: sem loops, recursão, chamadas arbitrárias, acesso a globals, rede ou bibliotecas externas. Novos métodos e construções exigem implementação explícita e testes adversariais.
- A aula HTML do botão verifica a estrutura e o texto do elemento; não simula uma interação de clique. Não deve ser apresentada como teste de comportamento JavaScript.

### Evidência automatizada

O workflow de backend executou a suíte com MongoDB replica set descartável, não pulou testes e terminou com **287 testes aprovados, 0 falhas e 0 ignorados** no commit `94eef13f`.

A integração HTTP cobre:
- rejeição de aula sem avaliador, sem XP e sem comprovante;
- rejeição de código que não passa nos testes confiáveis;
- duas submissões simultâneas idênticas, com uma única conclusão e um único incremento de 50 XP;
- rejeição de replay do comprovante;
- conclusão de aula Express com os dois arquivos declarados;
- rejeição de arquivo extra não declarado, sem XP adicional.

### Limites que permanecem

- Os testes acima usam uma base MongoDB descartável no CI. O fluxo com uma sessão de navegador real no Preview Vercel/Render ainda não foi validado; o Preview continua protegido por autenticação da Vercel.
- O serviço Render de staging está no plano Free e com deploy automático desligado. A validação de saúde por chamada HTTP externa não foi confirmada nesta etapa; os logs confirmam inicialização do servidor e conexão MongoDB.
- O inventário Atlas mostra os índices `jti_1` e `expiresAt_1`, mas a ferramenta de inspeção usada não expõe as opções `unique` e TTL. Não afirmar que essas opções estão confirmadas no cluster real apenas pelo nome dos índices.
- A avaliação em processo Node é uma linguagem interpretada restrita, não um sandbox de sistema operacional. Não habilitar execução arbitrária, linguagens adicionais ou aulas com efeitos externos sem isolamento e testes específicos.


## Atualização — segunda expansão de aulas verificáveis (2026-11-21)

A registry passou de 94 para **161 especificações confiáveis**:

- 26 especificações anteriores;
- 68 aulas HTML geradas do módulo 1 (padrões de perfil, cabeçalho, navegação e formulário);
- 67 aulas JavaScript geradas do módulo 2 (contagem de vogais, filtro de notas e validação de cupom).

Isso representa 161 de 700 IDs publicados (23%). A contagem não significa que 23% de todo o conteúdo já foi testado em navegador: representa aulas com critérios server-side explícitos e executáveis pelo avaliador atual.

### Critérios e limites

- Os IDs gerados são determinísticos e os testes esperados são definidos exclusivamente no backend.
- Aulas HTML aceitam exatamente `index.html` e `style.css`; o CSS é preservado no hash, mas não executado nem avaliado. As verificações são estruturais com parse5 e seletores permitidos.
- Aulas JavaScript usam somente as construções e métodos já permitidos pelo interpretador AST restrito, incluindo `split`, `filter`, `includes`, `trim` e `toUpperCase`.
- Aulas de CSS, Flexbox, Grid, debugging e outras variantes sem avaliador apropriado continuam sem XP oficial.
- A expansão não transforma os 700 IDs em 700 aulas completas: parte do currículo é gerada por modelos repetidos, e a qualidade pedagógica e a progressão precisam de revisão separada.

### Evidência CI e integração HTTP

No commit `8c530334`, o workflow executou **294 testes aprovados, zero falhas e zero ignorados**, usando MongoDB replica set descartável.

A suíte inclui:
- registro exato das 68 aulas HTML e 67 aulas JavaScript novas;
- aceitação apenas dos arquivos autorizados por aula;
- testes representativos para os quatro padrões HTML e três padrões JavaScript;
- fluxo HTTP de conclusão real com conta sintética: aulas Express de dois arquivos, aula HTML gerada e aula JavaScript gerada, com XP incrementado apenas após validação server-side.

O CI verde comprova o comportamento no ambiente descartável de testes. Ainda falta publicar esta versão no Render staging e validar o endpoint remoto; isso não autoriza publicação em produção.


### Publicação em staging — 2026-11-21

A versão com 161 especificações foi publicada no serviço Render `nexusdev-staging-v2`:

- Deploy `dep-dc11b1ec6qcc73cjuob0`, status `live`, commit `58ada5a5`.
- Plano do serviço: Free; deploy automático continua desligado.
- Logs do processo confirmam conexão ao MongoDB e inicialização do servidor NexusDev v2.0 na porta 10000.
- A verificação HTTP externa de `/api/health` e `/api/ready` não pôde ser concluída pelo verificador disponível. Portanto, o estado `live` e os logs de inicialização não são apresentados como prova de teste funcional remoto.
- Nenhum deploy ou alteração foi feito em produção.


## Atualização — cobertura dos módulos React, Express e segurança (2026-11-21)

A registry chegou a **464 especificações server-side confiáveis de 700 aulas (66,3%)**. A expansão adicionou:

- 136 aulas geradas do módulo 3: estado React imutável, `map`, `filter`, busca, `reduce` e paginação com `slice`.
- 34 aulas geradas do módulo 4: controllers Express com validação de campos e respostas HTTP verificadas.
- 133 aulas geradas do módulo 5: RBAC, validade de token, serialização segura de usuário e agregação de pedidos pagos.

O currículo foi ajustado para incorporar explicitamente `additionalChallenges` antes de gerar os itens restantes. Isso mantém os exercícios autorais dos módulos 3, 4 e 5 presentes na trilha e evita colisões de IDs entre esses exercícios e os modelos gerados. O total por módulo continua limitado a 140 aulas.

### Limites do suporte

- O módulo 4 só habilita as 34 variantes cujo padrão de controller já é coberto pelo avaliador HTTP. Os padrões com `Array.find`, optional chaining e conversão/limitação numérica ainda permanecem sem XP oficial.
- O interpretador AST ganhou apenas `Array.slice` com índices inteiros não negativos e limites sobre o array; não foi adicionada execução arbitrária nem acesso a APIs do Node.
- As aulas sem especificação explícita continuam sem XP oficial. A contagem 464 representa cobertura de validação server-side, não uma afirmação de que todas as 700 aulas tenham sido revisadas pedagogicamente ou testadas no navegador.

### Evidência automatizada

No commit `236a8e02`, o CI executou **300 testes aprovados, zero falhas e zero ignorados**, incluindo integração HTTP com MongoDB replica set descartável. A integração testa conclusões oficiais em aulas HTML, JavaScript, React, Express e MongoDB, e confirma o incremento de XP somente após a avaliação do servidor.
