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
| `mod-2-aula-5` | trim e toLowerCase | function-cases | Bloqueado | Métodos de string usados pelo exercício não estão na allowlist de chamadas do avaliador. |
| `mod-2-aula-6` | split com espaços/regex | function-cases | Bloqueado | split e regex não são suportados pelo avaliador restrito. |
| `mod-3-aula-2` | Retornar objeto de props | function-deep-equals | Bloqueado | O JS evaluator só seleciona specs com function-cases. |
| `mod-3-aula-3` | Atualizar preço sem mutar | deep-equals e does-not-mutate-input | Bloqueado | Tipos de teste não são tratados pelo JS evaluator. |
| `mod-3-aula-4` | Filtrar produtos | function-deep-equals | Bloqueado | Tipo de teste não suportado; filter também não está na allowlist de chamadas. |
| `react-01-carrinho-imutavel` | Adicionar/incrementar item sem mutação | deep-equals e does-not-mutate-input | Bloqueado | Tipos de teste não suportados; some/map/spread também não são avaliados pelo subconjunto atual. |
| `mod-4-aula-2` | Controller GET com resposta Express | http-controller-case | Bloqueado | Tipo de teste HTTP não implementado. |
| `mod-4-aula-3` | Validar produto | function-cases | Parcial | O formato de teste é reconhecido, mas trim e Number.isFinite não são suportados. |
| `mod-4-aula-4` | Sanitizar formato de erro | function-deep-equals | Bloqueado | Tipo de teste não suportado; validação de strings também requer recursos ausentes. |
| `node-01-controller-produto` | Controller POST com req/res | http-controller-case | Bloqueado | Tipo de teste HTTP não implementado. O currículo também apresenta arquivo de rota auxiliar; a facade atual rejeita arquivos extras. |
| `mod-5-aula-2` | Documento MongoDB com campos permitidos | deep-equals e does-not-mutate-input | Bloqueado | Tipos de teste não suportados; trim não suportado. |
| `mod-5-aula-3` | Atualização MongoDB com $set | deep-equals e does-not-mutate-input | Bloqueado | Tipos de teste não suportados; trim e validação numérica precisam de suporte. |
| `mod-5-aula-4` | Validar cadastro | function-cases | Parcial | Regex de e-mail e validações de string não são suportadas. |
| `mod-5-aula-5` | Política de senha com maiúscula/minúscula/número | function-cases | Bloqueado | Testes dependem de operações de string/regex ausentes. |
| `mod-5-aula-6` | Extrair Bearer token | function-cases | Bloqueado | Depende de regex/validação de string não suportadas. |
| `mod-5-aula-7` | RBAC | function-cases | Compatível com ressalva | Comparação de propriedades pode ser expressa no subconjunto; precisa de teste de execução com soluções de referência e entradas adversariais. |

## Conclusões verificáveis

1. A facade aceita somente **um arquivo**, com nome idêntico ao `entrypoint` registrado. Isso conflita com os dois exercícios Express que apresentam mais de um arquivo no editor.
2. O HTML evaluator implementa os cinco tipos de teste declarados para HTML, mas a aula de botão promete comportamento que os testes estáticos não observam.
3. O JavaScript evaluator procura exclusivamente testes do tipo `function-cases`; os tipos `function-deep-equals`, `does-not-mutate-input` e `http-controller-case` nunca chegam a ser avaliados como sucesso.
4. Mesmo nos desafios `function-cases`, a linguagem é intencionalmente limitada: chamadas permitidas incluem apenas `Array.prototype.reduce` no trecho de chamadas. Não há suporte geral a métodos de string, regex, `map`, `filter`, `some` ou loops.
5. A facade e os avaliadores permanecem protótipos internos; não estão integrados à API nem autorizam emissão de prova de conclusão.

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
