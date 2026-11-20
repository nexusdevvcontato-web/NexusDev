'use strict';

// Trusted, declarative lesson checks. Never accept this structure from a browser.
// Only lessons with an explicit specification are eligible for future runner execution.
const CHALLENGE_SPECS = Object.freeze({
  'html-00-o-que-e-web': {
    language: 'html', entrypoint: 'index.html',
    tests: [
      { type: 'selector-exists', selector: 'h1' },
      { type: 'text-includes', selector: 'h1', value: 'Olá, Mundo!' }
    ]
  },
  'html-01-subtitulo-h2': {
    language: 'html', entrypoint: 'index.html',
    tests: [
      { type: 'selector-exists', selector: 'h1' },
      { type: 'text-includes', selector: 'h2', value: 'Sobre Mim' }
    ]
  },
  'html-02-paragrafo-p': {
    language: 'html', entrypoint: 'index.html',
    tests: [
      { type: 'selector-exists', selector: 'p' },
      { type: 'text-min-length', selector: 'p', minLength: 5 }
    ]
  },
  'html-03-negrito-strong': {
    language: 'html', entrypoint: 'index.html',
    tests: [
      { type: 'selector-exists', selector: 'p' },
      { type: 'selector-text-min-length', selector: 'p strong', minLength: 1 }
    ]
  },
  'html-04-lista-ul-li': {
    language: 'html', entrypoint: 'index.html',
    tests: [
      { type: 'selector-exists', selector: 'ul' },
      { type: 'selector-count-min', selector: 'ul li', minCount: 3 }
    ]
  },
  'html-05-botao-clicavel': {
    language: 'html', entrypoint: 'index.html',
    tests: [
      { type: 'selector-exists', selector: 'button' },
      { type: 'text-includes', selector: 'button', value: 'Começar Agora' }
    ]
  },
  'js-01-variaveis-calculo': {
    language: 'javascript', entrypoint: 'script.js', exportName: 'calcularPrecoComDesconto',
    tests: [
      { type: 'function-cases', cases: [
        { args: [100, 20], expected: 80 },
        { args: [250, 10], expected: 225 },
        { args: [100, 0], expected: 100 }
      ]}
    ]
  },
  'js-02-condicionais-frete': {
    language: 'javascript', entrypoint: 'script.js', exportName: 'calcularFrete',
    tests: [
      { type: 'function-cases', cases: [
        { args: [200, false], expected: 0 },
        { args: [80, true], expected: 0 },
        { args: [150, false], expected: 25 },
        { args: [0, false], expected: 25 }
      ]}
    ]
  },
  'js-03-arrays-soma': {
    language: 'javascript', entrypoint: 'script.js', exportName: 'somarArray',
    tests: [
      { type: 'function-cases', cases: [
        { args: [[1, 2, 3, 4]], expected: 10 },
        { args: [[]], expected: 0 },
        { args: [[-2, 5]], expected: 3 }
      ]}
    ]
  },
  'mod-2-aula-4': {
    language: 'javascript', entrypoint: 'script.js', exportName: 'calcularMediaSegura',
    tests: [{ type: 'function-cases', cases: [
      { args: [[8, 10]], expected: 9 },
      { args: [[]], expected: 0 },
      { args: [[7]], expected: 7 },
      { args: [[-2, 4, 6]], expected: 8 / 3 }
    ]}]
  },
  'mod-2-aula-5': {
    language: 'javascript', entrypoint: 'script.js', exportName: 'normalizarEmail',
    tests: [{ type: 'function-cases', cases: [
      { args: ['  Dev@Exemplo.COM  '], expected: 'dev@exemplo.com' },
      { args: ['A B@EXEMPLO.COM'], expected: 'a b@exemplo.com' },
      { args: ['ana@site.com'], expected: 'ana@site.com' }
    ]}]
  },
  'mod-2-aula-6': {
    language: 'javascript', entrypoint: 'script.js', exportName: 'contarPalavras',
    tests: [{ type: 'function-cases', cases: [
      { args: ['Aprender JavaScript é prático'], expected: 4 },
      { args: ['  um   dois\t três  '], expected: 3 },
      { args: [''], expected: 0 },
      { args: ['   '], expected: 0 }
    ]}]
  },
  'mod-3-aula-2': {
    language: 'javascript', entrypoint: 'script.js', exportName: 'criarModeloCartaoProduto',
    tests: [{ type: 'function-deep-equals', args: [{ nome: 'Teclado', preco: 199.9 }], expected: { tipo: 'article', titulo: 'Teclado', preco: 199.9 } },
      { type: 'function-deep-equals', args: [{ nome: 'Mouse', preco: 59 }], expected: { tipo: 'article', titulo: 'Mouse', preco: 59 } },
      { type: 'does-not-mutate-input', args: [{ nome: 'Teclado', preco: 199.9 }] }]
  },
  'mod-3-aula-3': {
    language: 'javascript', entrypoint: 'script.js', exportName: 'atualizarPrecoProduto',
    tests: [{ type: 'function-deep-equals', args: [[{ id: 1, nome: 'Teclado', preco: 100 }, { id: 2, nome: 'Mouse', preco: 50 }], 2, 65], expected: [{ id: 1, nome: 'Teclado', preco: 100 }, { id: 2, nome: 'Mouse', preco: 65 }] },
      { type: 'does-not-mutate-input', args: [[{ id: 1, nome: 'Teclado', preco: 100 }], 1, 120] }]
  },
  'mod-3-aula-4': {
    language: 'javascript', entrypoint: 'script.js', exportName: 'filtrarProdutosPorPreco',
    tests: [{ type: 'function-deep-equals', args: [[{ nome: 'Mouse', preco: 50 }, { nome: 'Teclado', preco: 120 }, { nome: 'Monitor', preco: 900 }], 100], expected: [{ nome: 'Mouse', preco: 50 }] },
      { type: 'function-deep-equals', args: [[{ nome: 'Monitor', preco: 900 }], 100], expected: [] }]
  },
  'react-01-carrinho-imutavel': {
    language: 'javascript', entrypoint: 'script.js', exportName: 'adicionarAoCarrinho',
    tests: [
      { type: 'function-deep-equals', args: [[], { id: 1, nome: 'Teclado', preco: 200 }], expected: [{ id: 1, nome: 'Teclado', preco: 200, qtd: 1 }] },
      { type: 'function-deep-equals', args: [[{ id: 1, nome: 'Teclado', preco: 200, qtd: 1 }], { id: 1, nome: 'Teclado', preco: 200 }], expected: [{ id: 1, nome: 'Teclado', preco: 200, qtd: 2 }] },
      { type: 'does-not-mutate-input', args: [[], { id: 2, nome: 'Mouse', preco: 50 }] }
    ]
  },
  'mod-4-aula-2': {
    language: 'javascript', entrypoint: 'produtoController.js', exportName: 'listarProdutosController',
    tests: [{ type: 'http-controller-case', expectedStatus: 200, expectedBody: [{ id: 1, nome: 'Teclado' }, { id: 2, nome: 'Mouse' }] }]
  },
  'mod-4-aula-3': {
    language: 'javascript', entrypoint: 'validacao.js', exportName: 'validarProduto',
    tests: [{ type: 'function-cases', cases: [
      { args: [{ titulo: 'Teclado', preco: 120 }], expected: true },
      { args: [{ titulo: '   ', preco: 120 }], expected: false },
      { args: [{ titulo: 'Mouse', preco: 0 }], expected: false },
      { args: [{ titulo: 'Mouse', preco: -1 }], expected: false },
      { args: [{ titulo: 'Mouse', preco: '50' }], expected: false },
      { args: [null], expected: false }
    ]}]
  },
  'mod-4-aula-4': {
    language: 'javascript', entrypoint: 'errorHandler.js', exportName: 'formatarErroApi',
    tests: [{ type: 'function-deep-equals', args: [{ message: 'Produto não encontrado', code: 'NOT_FOUND' }], expected: { mensagem: 'Produto não encontrado', codigo: 'NOT_FOUND' } },
      { type: 'function-deep-equals', args: [{}], expected: { mensagem: 'Erro interno', codigo: 'INTERNAL_ERROR' } },
      { type: 'function-deep-equals', args: [{ message: 'Falha', code: 'DB_ERROR', stack: 'secret' }], expected: { mensagem: 'Falha', codigo: 'DB_ERROR' } }]
  },
  'mod-5-aula-2': {
    language: 'javascript', entrypoint: 'documento.js', exportName: 'criarDocumentoProduto',
    tests: [{ type: 'function-deep-equals', args: [{ titulo: '  Teclado  ', preco: 249.9, categoria: 'Periféricos', admin: true, _id: 'forjado' }], expected: { titulo: 'Teclado', preco: 249.9, categoria: 'Periféricos', ativo: true } },
      { type: 'function-deep-equals', args: [{ titulo: 'Mouse', preco: 50 }], expected: { titulo: 'Mouse', preco: 50, categoria: 'geral', ativo: true } },
      { type: 'does-not-mutate-input', args: [{ titulo: '  Monitor ', preco: 900 }] }]
  },
  'mod-5-aula-3': {
    language: 'javascript', entrypoint: 'atualizacao.js', exportName: 'criarAtualizacaoProduto',
    tests: [{ type: 'function-deep-equals', args: [{ titulo: '  Mouse Gamer ', preco: 120, ativo: false, admin: true }], expected: { $set: { titulo: 'Mouse Gamer', preco: 120, ativo: false } } },
      { type: 'function-deep-equals', args: [{ titulo: ' ', preco: -1, ativo: 'sim', role: 'admin' }], expected: { $set: {} } },
      { type: 'function-deep-equals', args: [{ ativo: true }], expected: { $set: { ativo: true } } },
      { type: 'does-not-mutate-input', args: [{ titulo: 'Novo', admin: false }] }]
  },
  'mod-5-aula-4': {
    language: 'javascript', entrypoint: 'cadastro.js', exportName: 'validarCadastroUsuario',
    tests: [{ type: 'function-cases', cases: [
      { args: [{ nome: 'Ana Silva', email: 'ana@exemplo.com', senha: 'senha-forte-123' }], expected: true },
      { args: [{ nome: ' ', email: 'ana@exemplo.com', senha: '12345678' }], expected: false },
      { args: [{ nome: 'Ana', email: 'email-invalido', senha: '12345678' }], expected: false },
      { args: [{ nome: 'Ana', email: 'ana@exemplo.com', senha: '1234567' }], expected: false },
      { args: [{ nome: 'Ana', email: 'ana@exemplo.com', senha: 'x'.repeat(129) }], expected: false },
      { args: [{ nome: 123, email: 'ana@exemplo.com', senha: 'senha-forte-123' }], expected: false },
      { args: [{ nome: 'Ana', email: 'ana@exemplo.com', senha: 12345678 }], expected: false },
      { args: [null], expected: false }
    ]}]
  },
  'mod-5-aula-5': {
    language: 'javascript', entrypoint: 'senha.js', exportName: 'validarPoliticaSenha',
    tests: [{ type: 'function-cases', cases: [
      { args: ['NexusDev2026'], expected: true },
      { args: ['nexusdev2026'], expected: false },
      { args: ['NEXUSDEV2026'], expected: false },
      { args: ['NexusDevSenha'], expected: false },
      { args: ['Ab1'], expected: false },
      { args: ['A'.repeat(129) + 'b1'], expected: false },
      { args: [12345678], expected: false }
    ]}]
  },
  'mod-5-aula-6': {
    language: 'javascript', entrypoint: 'token.js', exportName: 'extrairTokenBearer',
    tests: [{ type: 'function-cases', cases: [
      { args: ['Bearer abc.def.ghi'], expected: 'abc.def.ghi' },
      { args: ['bearer token123'], expected: 'token123' },
      { args: ['Basic abc'], expected: null },
      { args: ['Bearer '], expected: null },
      { args: ['Bearer abc extra'], expected: null },
      { args: [' Bearer abc'], expected: null },
      { args: ['Bearer  abc'], expected: null },
      { args: ['Bearer abc\\tdef'], expected: null },
      { args: ['Bearer abc\\r\\ndef'], expected: null },
      { args: [null], expected: null }
    ]}]
  },
  'mod-5-aula-7': {
    language: 'javascript', entrypoint: 'rbac.js', exportName: 'podeAcessarPerfil',
    tests: [{ type: 'function-cases', cases: [
      { args: [{ role: 'admin' }, 'admin'], expected: true },
      { args: [{ role: 'student' }, 'student'], expected: true },
      { args: [{ role: 'student' }, 'admin'], expected: false },
      { args: [{}, 'admin'], expected: false },
      { args: [null, 'admin'], expected: false },
      { args: [{ role: 'admin' }, ''], expected: false },
      { args: [{ role: 'admin' }, null], expected: false }
    ]}]
  },
  'node-01-controller-produto': {
    language: 'javascript', entrypoint: 'produtoController.js', exportName: 'criarProdutoController',
    tests: [
      { type: 'http-controller-case', body: { titulo: '', preco: -5 }, expectedStatus: 400, expectedBodyIncludes: 'erro' },
      { type: 'http-controller-case', body: { titulo: 'Teclado', preco: 200 }, expectedStatus: 201, expectedBody: { id: 101, titulo: 'Teclado', preco: 200 } },
      { type: 'http-controller-case', body: { titulo: 'Mouse', preco: 0 }, expectedStatus: 400, expectedBodyIncludes: 'erro' }
    ]
  }
});

function getChallengeSpec(challengeId) {
  return Object.prototype.hasOwnProperty.call(CHALLENGE_SPECS, challengeId)
    ? CHALLENGE_SPECS[challengeId]
    : null;
}

function isRunnerSupportedChallenge(challengeId) {
  return getChallengeSpec(challengeId) !== null;
}

module.exports = { CHALLENGE_SPECS, getChallengeSpec, isRunnerSupportedChallenge };
