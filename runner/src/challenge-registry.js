'use strict';

// Trusted, declarative lesson checks. Never accept this structure from a browser.
// Only lessons with an explicit specification are eligible for future runner execution.
function buildGeneratedModuleOneHtmlSpecs() {
  const specs = {};
  for (let lesson = 7; lesson <= 140; lesson += 1) {
    const scenario = lesson % 8;
    let tests;
    if (scenario === 0) {
      tests = [
        { type: 'selector-exists', selector: 'article.perfil h2' },
        { type: 'selector-exists', selector: 'article.perfil p' }
      ];
    } else if (scenario === 1) {
      const title = `Portfólio Dev #${lesson}`;
      tests = [
        { type: 'selector-exists', selector: 'header h1' },
        { type: 'text-includes', selector: 'header h1', value: title }
      ];
    } else if (scenario === 2) {
      tests = [{ type: 'selector-count-min', selector: 'nav a', minCount: 2 }];
    } else if (scenario === 3) {
      tests = [
        { type: 'selector-exists', selector: 'form input' },
        { type: 'selector-exists', selector: 'form button' }
      ];
    } else {
      continue;
    }
    specs[`mod-1-aula-${lesson}`] = {
      language: 'html',
      entrypoint: 'index.html',
      supportingFiles: ['style.css'],
      tests
    };
  }
  return specs;
}

// Generated lessons are deterministic templates. HTML and the restricted CSS
// declaration checks are registered separately; unsupported browser behavior stays study-only.

function buildGeneratedModuleOneCssSpecs() {
  const specs = {};
  for (let lesson = 7; lesson <= 140; lesson += 1) {
    const scenario = lesson % 8;
    let tests;
    if (scenario === 4) {
      const padPx = 16 + (lesson % 4) * 4;
      tests = [
        { type: 'css-declaration', selector: '.caixa-destaque', property: 'padding', expected: `${padPx}px` },
        { type: 'css-declaration', selector: '.caixa-destaque', property: 'border-radius', expected: '12px' }
      ];
    } else if (scenario === 5) {
      tests = [
        { type: 'css-declaration', selector: '.centro', property: 'display', expected: 'flex' },
        { type: 'css-declaration', selector: '.centro', property: 'justify-content', expected: 'center' },
        { type: 'css-declaration', selector: '.centro', property: 'align-items', expected: 'center' }
      ];
    } else if (scenario === 6) {
      const cols = (lesson % 2) + 2;
      tests = [
        { type: 'css-declaration', selector: '.vitrine', property: 'display', expected: 'grid' },
        { type: 'css-declaration', selector: '.vitrine', property: 'grid-template-columns', expected: `repeat(${cols}, 1fr)` }
      ];
    } else if (scenario === 7) {
      tests = [
        { type: 'source-contains', value: '</p>' },
        { type: 'css-declaration', selector: '.alerta', property: 'color', expected: '#f8fafc' }
      ];
    } else {
      continue;
    }
    specs[`mod-1-aula-${lesson}`] = {
      language: 'html',
      entrypoint: 'index.html',
      supportingFiles: ['style.css'],
      tests
    };
  }
  return specs;
}

function buildGeneratedModuleTwoJavaScriptSpecs() {
  const specs = {};
  for (let lesson = 7; lesson <= 140; lesson += 1) {
    const kind = lesson % 6;
    if (kind === 1) {
      const exportName = `formatarMoedaBRL_${lesson}`;
      specs[`mod-2-aula-${lesson}`] = {
        language: 'javascript', entrypoint: 'script.js', exportName,
        tests: [{ type: 'function-cases', cases: [
          { args: [49.9], expected: 'R$ 49.90' }
        ] }]
      };
    } else if (kind === 2) {
      const exportName = `contarVogais_${lesson}`;
      specs[`mod-2-aula-${lesson}`] = {
        language: 'javascript',
        entrypoint: 'script.js',
        exportName,
        tests: [{ type: 'function-cases', cases: [
          { args: ['NexusDev'], expected: 3 },
          { args: ['AEIOU'], expected: 5 },
          { args: ['xyz'], expected: 0 },
          { args: [''], expected: 0 }
        ] }]
      };
    } else if (kind === 3) {
      const exportName = `filtrarAprovados_${lesson}`;
      const minGrade = 6 + (lesson % 3);
      specs[`mod-2-aula-${lesson}`] = {
        language: 'javascript',
        entrypoint: 'script.js',
        exportName,
        tests: [{ type: 'function-cases', cases: [
          { args: [[4, 8, 9, 5]], expected: [8, 9] },
          { args: [[minGrade - 1, minGrade, minGrade + 1]], expected: [minGrade, minGrade + 1] },
          { args: [[]], expected: [] }
        ] }]
      };
    } else if (kind === 4) {
      const exportName = `aplicarCupom_${lesson}`;
      const discount = 10 + (lesson % 4) * 5;
      const discounted = 200 * ((100 - discount) / 100);
      specs[`mod-2-aula-${lesson}`] = {
        language: 'javascript',
        entrypoint: 'script.js',
        exportName,
        tests: [{ type: 'function-cases', cases: [
          { args: [200, 'nexus'], expected: discounted },
          { args: [200, ' NEXUS '], expected: discounted },
          { args: [200, 'INVALIDO'], expected: 200 }
        ] }]
      };
    } else if (kind === 5) {
      const exportName = `encontrarMaior_${lesson}`;
      specs[`mod-2-aula-${lesson}`] = {
        language: 'javascript', entrypoint: 'script.js', exportName,
        tests: [{ type: 'function-cases', cases: [
          { args: [[12, 45, 7, 89, 23]], expected: 89 },
          { args: [[-5, -2, -9]], expected: -2 },
          { args: [[]], expected: 0 }
        ] }]
      };
    } else {
      const exportName = `calcularMedia_${lesson}`;
      specs[`mod-2-aula-${lesson}`] = {
        language: 'javascript', entrypoint: 'script.js', exportName,
        tests: [{ type: 'function-cases', cases: [
          { args: [[]], expected: 0 },
          { args: [[8, 10]], expected: 9 },
          { args: [[5, 7, 9]], expected: 7 }
        ] }]
      };
    }
  }
  return specs;
}

// These generated JavaScript exercises are registered only when every operation
// used by the lesson is supported by the bounded AST interpreter and has cases.
function buildGeneratedModuleThreeJavaScriptSpecs() {
  const specs = {};
  for (let lesson = 5; lesson <= 140; lesson += 1) {
    const scenario = lesson % 5;
    if (scenario === 0) {
      const exportName = `alternarFavoritoReact_${lesson}`;
      const args = [[{ id: 1, favorito: false }], 1];
      specs[`mod-3-aula-${lesson}`] = {
        language: 'javascript', entrypoint: 'script.js', exportName,
        tests: [
          { type: 'function-deep-equals', args, expected: [{ id: 1, favorito: true }] },
          { type: 'does-not-mutate-input', args }
        ]
      };
    } else if (scenario === 1) {
      const exportName = `removerItemEstado_${lesson}`;
      const args = [[{ id: 1 }, { id: 2 }], 1];
      specs[`mod-3-aula-${lesson}`] = {
        language: 'javascript', entrypoint: 'script.js', exportName,
        tests: [
          { type: 'function-deep-equals', args, expected: [{ id: 2 }] },
          { type: 'does-not-mutate-input', args }
        ]
      };
    } else if (scenario === 2) {
      const exportName = `filtrarBuscaProdutos_${lesson}`;
      const args = [[{ nome: 'Teclado Mecânico' }, { nome: 'Mouse Gamer' }], 'MOUSE'];
      specs[`mod-3-aula-${lesson}`] = {
        language: 'javascript', entrypoint: 'script.js', exportName,
        tests: [
          { type: 'function-deep-equals', args, expected: [{ nome: 'Mouse Gamer' }] },
          { type: 'does-not-mutate-input', args }
        ]
      };
    } else if (scenario === 3) {
      const exportName = `calcularSubtotalCarrinho_${lesson}`;
      specs[`mod-3-aula-${lesson}`] = {
        language: 'javascript', entrypoint: 'script.js', exportName,
        tests: [
          { type: 'function-deep-equals', args: [[{ preco: 120, qtd: 2 }, { preco: 50, qtd: 1 }]], expected: 290 },
          { type: 'function-deep-equals', args: [[]], expected: 0 }
        ]
      };
    } else {
      const exportName = `paginarListaReact_${lesson}`;
      specs[`mod-3-aula-${lesson}`] = {
        language: 'javascript', entrypoint: 'script.js', exportName,
        tests: [
          { type: 'function-deep-equals', args: [['A', 'B', 'C', 'D', 'E'], 2, 2], expected: ['C', 'D'] },
          { type: 'function-deep-equals', args: [['A', 'B', 'C'], 1, 2], expected: ['A', 'B'] }
        ]
      };
    }
  }
  return specs;
}

function buildGeneratedModuleFourJavaScriptSpecs() {
  const specs = {};
  for (let lesson = 5; lesson <= 140; lesson += 1) {
    const scenario = lesson % 4;
    if (scenario === 0) {
      const exportName = `handlerExpress_${lesson}`;
      specs[`mod-4-aula-${lesson}`] = {
        language: 'javascript',
        entrypoint: 'controller.js',
        exportName,
        tests: [
          { type: 'http-controller-case', body: { nome: 'ab' }, expectedStatus: 400, expectedBodyIncludes: 'erro' },
          { type: 'http-controller-case', body: { nome: 'Notebook Pro' }, expectedStatus: 200,
            expectedBody: { ok: true, nome: 'Notebook Pro' } }
        ]
      };
    } else if (scenario === 1) {
      const exportName = `buscarPorIdController_${lesson}`;
      const lista = [{ id: '1', nome: 'Item 1' }, { id: '2', nome: 'Item 2' }];
      specs[`mod-4-aula-${lesson}`] = {
        language: 'javascript',
        entrypoint: 'controller.js',
        exportName,
        tests: [
          { type: 'http-controller-case', params: { id: '99' }, extraArgs: [lista],
            expectedStatus: 404, expectedBody: { erro: 'Não encontrado' } },
          { type: 'http-controller-case', params: { id: '1' }, extraArgs: [lista],
            expectedStatus: 200, expectedBody: lista[0] }
        ]
      };
    } else if (scenario === 2) {
      const exportName = `validarCadastroEmail_${lesson}`;
      specs[`mod-4-aula-${lesson}`] = {
        language: 'javascript', entrypoint: 'validateMiddleware.js', exportName,
        tests: [
          { type: 'middleware-case', request: { body: { email: 'invalido', senha: 'segredo123' } },
            expectedNext: false, expectedStatus: 400, expectedBody: { erro: 'Credenciais inválidas' } },
          { type: 'middleware-case', request: { body: { email: 'dev@nexus.com', senha: '123' } },
            expectedNext: false, expectedStatus: 400, expectedBody: { erro: 'Credenciais inválidas' } },
          { type: 'middleware-case', request: { body: { email: 'dev@nexus.com', senha: 'segredo123' } },
            expectedNext: true }
        ]
      };
    } else {
      const exportName = `normalizarQueryFiltro_${lesson}`;
      specs[`mod-4-aula-${lesson}`] = {
        language: 'javascript', entrypoint: 'queryHelper.js', exportName,
        tests: [{ type: 'function-cases', cases: [
          { args: [{ page: '2', limit: '50' }], expected: { page: 2, limit: 20 } },
          { args: [{ page: '-3', limit: '0' }], expected: { page: 1, limit: 10 } },
          { args: [{ page: 'abc', limit: 'abc' }], expected: { page: 1, limit: 10 } },
          { args: [{}], expected: { page: 1, limit: 10 } }
        ] }]
      };
    }
  }
  return specs;
}

function buildGeneratedModuleFiveJavaScriptSpecs() {
  const specs = {};
  for (let lesson = 8; lesson <= 140; lesson += 1) {
    const scenario = lesson % 4;
    if (scenario === 0) {
      const exportName = `validarPermissaoJWT_${lesson}`;
      const requiredRole = lesson % 2 === 0 ? 'admin' : 'editor';
      specs[`mod-5-aula-${lesson}`] = {
        language: 'javascript', entrypoint: 'rbac.js', exportName,
        tests: [{ type: 'function-cases', cases: [
          { args: [{ role: requiredRole }], expected: true },
          { args: [{ role: 'guest' }], expected: false },
          { args: [null], expected: false }
        ] }]
      };
    } else if (scenario === 1) {
      const exportName = `verificarExpiracaoToken_${lesson}`;
      specs[`mod-5-aula-${lesson}`] = {
        language: 'javascript', entrypoint: 'jwtGuard.js', exportName,
        tests: [{ type: 'function-cases', cases: [
          { args: [{ exp: 2000 }, 1500], expected: true },
          { args: [{ exp: 1500 }, 1500], expected: false },
          { args: [{ exp: 1000 }, 1500], expected: false },
          { args: [null, 1500], expected: false }
        ] }]
      };
    } else if (scenario === 2) {
      const exportName = `sanitizarUsuarioPublico_${lesson}`;
      specs[`mod-5-aula-${lesson}`] = {
        language: 'javascript', entrypoint: 'userSerializer.js', exportName,
        tests: [
          { type: 'function-deep-equals',
            args: [{ _id: '1', name: 'Ana', email: 'ana@dev.com', passwordHash: 'secret' }],
            expected: { id: '1', name: 'Ana', email: 'ana@dev.com' } }
        ]
      };
    } else {
      const exportName = `somarPedidosPagos_${lesson}`;
      specs[`mod-5-aula-${lesson}`] = {
        language: 'javascript', entrypoint: 'relatorioPedidos.js', exportName,
        tests: [{ type: 'function-cases', cases: [
          { args: [[{ status: 'pago', total: 150 }, { status: 'pendente', total: 300 }, { status: 'pago', total: 50 }]], expected: 200 },
          { args: [[]], expected: 0 },
          { args: [[{ status: 'pendente', total: 300 }]], expected: 0 }
        ] }]
      };
    }
  }
  return specs;
}

const CHALLENGE_SPECS = Object.freeze({
  ...buildGeneratedModuleThreeJavaScriptSpecs(),
  ...buildGeneratedModuleFourJavaScriptSpecs(),
  ...buildGeneratedModuleFiveJavaScriptSpecs(),
  ...buildGeneratedModuleTwoJavaScriptSpecs(),
  ...buildGeneratedModuleOneHtmlSpecs(),
  ...buildGeneratedModuleOneCssSpecs(),
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
    language: 'javascript', entrypoint: 'produtoController.js', supportingFiles: ['server.js'], exportName: 'listarProdutosController',
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
      { args: [{ titulo: 'Mouse', preco: Infinity }], expected: false },
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
    tests: [{ type: 'function-deep-equals', args: [{ titulo: '  Teclado  ', preco: 249.9, categoria: ' Periféricos ', admin: true, _id: 'forjado' }], expected: { titulo: 'Teclado', preco: 249.9, categoria: 'Periféricos', ativo: true } },
      { type: 'function-deep-equals', args: [{ titulo: 'Mouse', preco: 50 }], expected: { titulo: 'Mouse', preco: 50, categoria: 'geral', ativo: true } },
      { type: 'function-deep-equals', args: [{ titulo: '  Cabo USB ', preco: 19.5, categoria: '   ', role: 'admin', isAdmin: true, $set: { admin: true }, $inc: { preco: 999 }, _id: 'attacker-id' }], expected: { titulo: 'Cabo USB', preco: 19.5, categoria: 'geral', ativo: true } },
      { type: 'does-not-mutate-input', args: [{ titulo: '  Monitor ', preco: 900, categoria: ' Vídeo ', admin: true }] }]
  },
  'mod-5-aula-3': {
    language: 'javascript', entrypoint: 'atualizacao.js', exportName: 'criarAtualizacaoProduto',
    tests: [{ type: 'function-deep-equals', args: [{ titulo: '  Mouse Gamer ', preco: 120, ativo: false, admin: true }], expected: { $set: { titulo: 'Mouse Gamer', preco: 120, ativo: false } } },
      { type: 'function-deep-equals', args: [{ titulo: ' ', preco: -1, ativo: 'sim', role: 'admin' }], expected: { $set: {} } },
      { type: 'function-deep-equals', args: [{ ativo: true }], expected: { $set: { ativo: true } } },
      { type: 'function-deep-equals', args: [{ titulo: '  Teclado  ', preco: Infinity, ativo: false, $set: { admin: true }, $inc: { preco: 1000 }, $where: 'return true', role: 'admin', _id: 'forjado' }], expected: { $set: { titulo: 'Teclado', ativo: false } } },
      { type: 'function-deep-equals', args: [{ titulo: 123, preco: '120', ativo: 1, $unset: { admin: 1 }, isAdmin: true }], expected: { $set: {} } },
      { type: 'does-not-mutate-input', args: [{ titulo: 'Novo', admin: false, $inc: { preco: 1 } }] }]
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
      { args: ['Bearer abc\tdef'], expected: null },
      { args: ['Bearer abc\r\ndef'], expected: null },
      { args: [null], expected: null }
    ]}]
  },
  'mod-5-aula-7': {
    language: 'javascript', entrypoint: 'rbac.js', exportName: 'podeAcessarPerfil',
    tests: [{ type: 'function-cases', cases: [
      { args: [{ role: 'admin' }, 'admin'], expected: true },
      { args: [{ role: 'student' }, 'student'], expected: true },
      { args: [{ role: 'student' }, 'admin'], expected: false },
      { args: [{ role: 'student', isAdmin: true }, 'admin'], expected: false },
      { args: [{}, 'admin'], expected: false },
      { args: [null, 'admin'], expected: false },
      { args: [{ role: 'admin' }, ''], expected: false },
      { args: [{ role: 'admin' }, null], expected: false }
    ]}]
  },
  'auth-01-middleware-admin': {
    language: 'javascript', entrypoint: 'authMiddleware.js', exportName: 'verificarAdmin',
    tests: [
      { type: 'middleware-case', request: { headers: {} }, expectedNext: false,
        expectedStatus: 401, expectedBody: { erro: 'Não autorizado' } },
      { type: 'middleware-case', request: { headers: { authorization: 'Basic token' }, usuario: { cargo: 'admin' } },
        expectedNext: false, expectedStatus: 401, expectedBody: { erro: 'Não autorizado' } },
      { type: 'middleware-case', request: { headers: { authorization: 'Bearer token_admin' }, usuario: { cargo: 'student' } },
        expectedNext: false, expectedStatus: 403, expectedBody: { erro: 'Acesso restrito' } },
      { type: 'middleware-case', request: { headers: { authorization: 'Bearer token_admin' }, usuario: { cargo: 'admin' } },
        expectedNext: true }
    ]
  },
  'node-01-controller-produto': {
    language: 'javascript', entrypoint: 'produtoController.js', supportingFiles: ['server.js'], exportName: 'criarProdutoController',
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

function getAllowedChallengeFiles(spec) {
  if (!spec || typeof spec.entrypoint !== 'string') return [];
  const supportingFiles = spec.supportingFiles ?? [];
  if (!Array.isArray(supportingFiles) ||
      supportingFiles.some((name) => typeof name !== 'string' || !name || name === spec.entrypoint) ||
      new Set(supportingFiles).size !== supportingFiles.length) return [];
  return [spec.entrypoint, ...supportingFiles];
}

function validateChallengeFiles(challengeId, files) {
  const spec = getChallengeSpec(challengeId);
  if (!spec || !files || typeof files !== 'object' || Array.isArray(files)) return false;
  const prototype = Object.getPrototypeOf(files);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const allowed = getAllowedChallengeFiles(spec);
  const names = Object.keys(files);
  return allowed.length > 0 && names.length === allowed.length &&
    allowed.every((name) => Object.hasOwn(files, name) && typeof files[name] === 'string') &&
    names.every((name) => allowed.includes(name));
}

module.exports = {
  CHALLENGE_SPECS,
  getChallengeSpec,
  isRunnerSupportedChallenge,
  getAllowedChallengeFiles,
  validateChallengeFiles
};
