'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluateRegisteredChallenge } = require('../src/evaluator');

test('routes registered HTML lessons to the HTML evaluator', () => {
  assert.deepEqual(evaluateRegisteredChallenge({
    challengeId: 'html-00-o-que-e-web',
    files: { 'index.html': '<h1>Olá, Mundo!</h1>' }
  }), { ok: true });
});

test('routes registered JavaScript lessons to the restricted JavaScript evaluator', () => {
  assert.deepEqual(evaluateRegisteredChallenge({
    challengeId: 'js-01-variaveis-calculo',
    files: { 'script.js': 'function calcularPrecoComDesconto(preco, desconto) { return preco - preco * desconto / 100; }' }
  }), { ok: true });
});

test('does not route unknown or unsupported lessons', () => {
  assert.deepEqual(evaluateRegisteredChallenge({
    challengeId: 'mod-1-aula-7',
    files: { 'index.html': '<h1>Olá, Mundo!</h1>' }
  }), { ok: false, reason: 'unsupported-challenge' });
  assert.deepEqual(evaluateRegisteredChallenge({
    challengeId: 'mod-1-aula-7',
    files: { 'script.js': 'function exemplo() { return true; }' }
  }), { ok: false, reason: 'unsupported-challenge' });
});

test('routes registered Express controller lessons to the isolated controller evaluator', () => {
  const source = 'function listarProdutosController(req, res) { return res.status(200).json([{ id: 1, nome: "Teclado" }, { id: 2, nome: "Mouse" }]); }';
  assert.deepEqual(evaluateRegisteredChallenge({
    challengeId: 'mod-4-aula-2',
    files: { 'produtoController.js': source, 'server.js': "// app.get('/api/produtos', listarProdutosController);" }
  }), { ok: true });
});

test('requires the exact trusted entrypoint and rejects extra files', () => {
  assert.deepEqual(evaluateRegisteredChallenge({
    challengeId: 'html-00-o-que-e-web',
    files: { 'script.js': '<h1>Olá, Mundo!</h1>' }
  }), { ok: false, reason: 'entrypoint-mismatch' });
  assert.deepEqual(evaluateRegisteredChallenge({
    challengeId: 'html-00-o-que-e-web',
    files: { 'index.html': '<h1>Olá, Mundo!</h1>', 'extra.js': 'alert(1)' }
  }), { ok: false, reason: 'entrypoint-mismatch' });
});

test('rejects malformed facade requests', () => {
  assert.deepEqual(evaluateRegisteredChallenge(null), { ok: false, reason: 'invalid-request' });
  assert.deepEqual(evaluateRegisteredChallenge({ challengeId: 'html-00-o-que-e-web', files: [] }), { ok: false, reason: 'invalid-request' });
  assert.deepEqual(evaluateRegisteredChallenge({ challengeId: 'html-00-o-que-e-web', files: { 'index.html': 42 } }), { ok: false, reason: 'entrypoint-mismatch' });
});


test('evaluates generated module-one profile, header, navigation and form lessons', () => {
  const cases = [
    ['mod-1-aula-8', '<article class="perfil"><h2>Ana</h2><p>Full-Stack Developer</p></article>'],
    ['mod-1-aula-9', '<header><h1>Portfólio Dev #9</h1></header>'],
    ['mod-1-aula-10', '<nav><a href="#inicio">Início</a><a href="#projetos">Projetos</a></nav>'],
    ['mod-1-aula-11', '<form><input type="email" placeholder="Seu e-mail"><button>Enviar</button></form>']
  ];
  for (const [challengeId, html] of cases) {
    assert.deepEqual(evaluateRegisteredChallenge({
      challengeId,
      files: { 'index.html': html, 'style.css': '/* optional starter stylesheet */' }
    }), { ok: true }, challengeId);
  }
});

test('generated HTML lessons reject missing or undeclared supporting files', () => {
  assert.deepEqual(evaluateRegisteredChallenge({
    challengeId: 'mod-1-aula-9',
    files: { 'index.html': '<header><h1>Portfólio Dev #9</h1></header>' }
  }), { ok: false, reason: 'entrypoint-mismatch' });
  assert.deepEqual(evaluateRegisteredChallenge({
    challengeId: 'mod-1-aula-9',
    files: { 'index.html': '<header><h1>Portfólio Dev #9</h1></header>', 'style.css': '', 'extra.js': 'x' }
  }), { ok: false, reason: 'entrypoint-mismatch' });
});


test('evaluates generated module-two vowel, filter and coupon lessons', () => {
  const cases = [
    ['mod-2-aula-8', "function contarVogais_8(texto) { return texto.toLowerCase().split('').filter(letra => 'aeiou'.includes(letra)).length; }"],
    ['mod-2-aula-9', 'function filtrarAprovados_9(notas) { return notas.filter(nota => nota >= 6); }'],
    ['mod-2-aula-10', "function aplicarCupom_10(total, cupom) { return cupom.trim().toUpperCase() === 'NEXUS' ? total * 0.8 : total; }"]
  ];
  for (const [challengeId, source] of cases) {
    assert.deepEqual(evaluateRegisteredChallenge({
      challengeId,
      files: { 'script.js': source }
    }), { ok: true }, challengeId);
  }
});


test('evaluates generated module-three React state and pagination lessons', () => {
  const cases = [
    ['mod-3-aula-5', 'function alternarFavoritoReact_5(itens, idAlvo) { return itens.map(item => item.id === idAlvo ? { ...item, favorito: !item.favorito } : item); }'],
    ['mod-3-aula-6', 'function removerItemEstado_6(itens, idRemover) { return itens.filter(item => item.id !== idRemover); }'],
    [ 'mod-3-aula-7', "function filtrarBuscaProdutos_7(produtos, termoBusca) { return produtos.filter(p => p.nome.toLowerCase().includes(termoBusca.trim().toLowerCase())); }" ],
    ['mod-3-aula-8', 'function calcularSubtotalCarrinho_8(carrinho) { return carrinho.reduce((acc, item) => acc + item.preco * item.qtd, 0); }'],
    ['mod-3-aula-9', 'function paginarListaReact_9(itens, pagina, porPagina) { const inicio = (pagina - 1) * porPagina; return itens.slice(inicio, inicio + porPagina); }']
  ];
  for (const [challengeId, source] of cases) {
    assert.deepEqual(evaluateRegisteredChallenge({ challengeId, files: { 'script.js': source } }), { ok: true }, challengeId);
  }
});

test('evaluates generated Express and module-five security/data lessons', () => {
  const cases = [
    ['mod-4-aula-8', "function handlerExpress_8(req, res) { const nome = req.body.nome; if (!nome || nome.trim().length < 3) return res.status(400).json({ erro: 'Nome muito curto' }); return res.status(200).json({ ok: true, nome: nome.trim() }); }", 'controller.js'],
    ['mod-5-aula-8', "function validarPermissaoJWT_8(usuario) { return usuario && usuario.role === 'admin'; }", 'rbac.js'],
    ['mod-5-aula-9', "function verificarExpiracaoToken_9(payload, agoraSegundos) { return payload && typeof payload.exp === 'number' && payload.exp > agoraSegundos; }", 'jwtGuard.js'],
    ['mod-5-aula-10', 'function sanitizarUsuarioPublico_10(userDoc) { return { id: userDoc._id, name: userDoc.name, email: userDoc.email }; }', 'userSerializer.js'],
    ['mod-5-aula-11', "function somarPedidosPagos_11(pedidos) { return pedidos.filter(p => p.status === 'pago').reduce((acc, p) => acc + p.total, 0); }", 'relatorioPedidos.js']
  ];
  for (const [challengeId, source, filename] of cases) {
    assert.deepEqual(evaluateRegisteredChallenge({ challengeId, files: { [filename]: source } }), { ok: true }, challengeId);
  }
});
