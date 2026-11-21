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
    challengeId: 'mod-1-aula-141',
    files: { 'index.html': '<h1>Olá, Mundo!</h1>' }
  }), { ok: false, reason: 'unsupported-challenge' });
  assert.deepEqual(evaluateRegisteredChallenge({
    challengeId: 'mod-1-aula-141',
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

test('evaluates generated Express find-by-id controllers for found and missing resources', () => {
  const source = "function buscarPorIdController_5(req, res, lista) { const item = lista.find(i => i.id === req.params.id); if (!item) return res.status(404).json({ erro: 'Não encontrado' }); return res.status(200).json(item); }";
  assert.deepEqual(evaluateRegisteredChallenge({
    challengeId: 'mod-4-aula-5',
    files: { 'controller.js': source }
  }), { ok: true });
});

test('rejects generated Express find-by-id controllers with incorrect status or body', () => {
  const wrongStatus = "function buscarPorIdController_5(req, res, lista) { const item = lista.find(i => i.id === req.params.id); return res.status(200).json(item || { erro: 'Não encontrado' }); }";
  assert.deepEqual(evaluateRegisteredChallenge({
    challengeId: 'mod-4-aula-5',
    files: { 'controller.js': wrongStatus }
  }), { ok: false, reason: 'tests-failed' });
});

test('evaluates generated Express and module-five security/data lessons', () => {
  const cases = [
    ['mod-4-aula-8', "function handlerExpress_8(req, res) { const nome = req.body.nome; if (!nome || nome.trim().length < 3) return res.status(400).json({ erro: 'Nome muito curto' }); return res.status(200).json({ ok: true, nome: nome.trim() }); }", 'controller.js'],
    ['mod-5-aula-8', "function validarPermissaoJWT_8(usuario) { return !!(usuario && usuario.role === 'admin'); }", 'rbac.js'],
    ['mod-5-aula-9', "function verificarExpiracaoToken_9(payload, agoraSegundos) { return !!(payload && typeof payload.exp === 'number' && payload.exp > agoraSegundos); }", 'jwtGuard.js'],
    ['mod-5-aula-10', 'function sanitizarUsuarioPublico_10(userDoc) { return { id: userDoc._id, name: userDoc.name, email: userDoc.email }; }', 'userSerializer.js'],
    ['mod-5-aula-11', "function somarPedidosPagos_11(pedidos) { return pedidos.filter(p => p.status === 'pago').reduce((acc, p) => acc + p.total, 0); }", 'relatorioPedidos.js']
  ];
  for (const [challengeId, source, filename] of cases) {
    assert.deepEqual(evaluateRegisteredChallenge({ challengeId, files: { [filename]: source } }), { ok: true }, challengeId);
  }
});

test('evaluates generated Box Model, Flexbox, Grid and debugging CSS lessons end-to-end', () => {
  const cases = [
    ['mod-1-aula-12', '<div class="caixa-destaque">Card</div>', '.caixa-destaque { padding: 16px; border-radius: 12px; }'],
    ['mod-1-aula-13', '<div class="centro"><span>Badge</span></div>', '.centro { display: flex; justify-content: center; align-items: center; }'],
    ['mod-1-aula-14', '<div class="vitrine"><div>A</div><div>B</div></div>', '.vitrine { display: grid; grid-template-columns: repeat(2, 1fr); }'],
    ['mod-1-aula-15', '<div class="alerta"><p>Atenção</p></div>', '.alerta { color: #f8fafc; }']
  ];
  for (const [challengeId, html, css] of cases) {
    assert.deepEqual(evaluateRegisteredChallenge({
      challengeId,
      files: { 'index.html': html, 'style.css': css }
    }), { ok: true }, challengeId);
  }
});

test('rejects CSS lesson submissions with missing stylesheet or invalid required declarations', () => {
  assert.deepEqual(evaluateRegisteredChallenge({
    challengeId: 'mod-1-aula-13',
    files: { 'index.html': '<div class="centro"></div>', 'style.css': '.centro { display: block; justify-content: center; align-items: center; }' }
  }), { ok: false, reason: 'tests-failed' });
  assert.deepEqual(evaluateRegisteredChallenge({
    challengeId: 'mod-1-aula-13',
    files: { 'index.html': '<div class="centro"></div>', 'style.css': '' }
  }), { ok: false, reason: 'tests-failed' });
});

test('evaluates generated Express email middleware with optional chaining and next callback', () => {
  const source = "function validarCadastroEmail_6(req, res, next) { if (!req.body?.email?.includes('@') || (req.body?.senha || '').length < 6) return res.status(400).json({ erro: 'Credenciais inválidas' }); next(); }";
  assert.deepEqual(evaluateRegisteredChallenge({
    challengeId: 'mod-4-aula-6',
    files: { 'validateMiddleware.js': source }
  }), { ok: true });
});

test('evaluates generated Express pagination helpers with bounded Number and Math methods', () => {
  const source = "function normalizarQueryFiltro_7(query) { const page = Math.max(1, Number(query.page) || 1); const limit = Math.min(20, Math.max(1, Number(query.limit) || 10)); return { page, limit }; }";
  assert.deepEqual(evaluateRegisteredChallenge({
    challengeId: 'mod-4-aula-7',
    files: { 'queryHelper.js': source }
  }), { ok: true });
});

test('rejects Express middleware that skips next or accepts invalid credentials', () => {
  const source = "function validarCadastroEmail_6(req, res, next) { if (!req.body?.email?.includes('@')) return res.status(200).json({ ok: true }); next(); }";
  assert.deepEqual(evaluateRegisteredChallenge({
    challengeId: 'mod-4-aula-6',
    files: { 'validateMiddleware.js': source }
  }), { ok: false, reason: 'tests-failed' });
});

test('rejects unsupported optional calls and non-whitelisted Math methods', () => {
  assert.deepEqual(evaluateRegisteredChallenge({
    challengeId: 'mod-4-aula-7',
    files: { 'queryHelper.js': 'function normalizarQueryFiltro_7(query) { return Math.random(); }' }
  }), { ok: false, reason: 'unsupported-call' });
});

test('evaluates generated module-two currency formatting with a bounded template literal and toFixed', () => {
  const source = 'function formatarMoedaBRL_7(valor) { return `R$ ${valor.toFixed(2)}`; }';
  assert.deepEqual(evaluateRegisteredChallenge({
    challengeId: 'mod-2-aula-7',
    files: { 'script.js': source }
  }), { ok: true });
});

test('evaluates generated module-two maximum and average lessons with safe array operations', () => {
  const maximum = "function encontrarMaior_11(numeros) { if (numeros.length === 0) return 0; return Math.max(...numeros); }";
  const average = "function calcularMedia_12(notas) { if (!notas || notas.length === 0) return 0; const soma = notas.reduce((acc, n) => acc + n, 0); return soma / notas.length; }";
  assert.deepEqual(evaluateRegisteredChallenge({
    challengeId: 'mod-2-aula-11',
    files: { 'script.js': maximum }
  }), { ok: true });
  assert.deepEqual(evaluateRegisteredChallenge({
    challengeId: 'mod-2-aula-12',
    files: { 'script.js': average }
  }), { ok: true });
});

test('rejects arbitrary spread calls and unsupported numeric formatting methods', () => {
  assert.deepEqual(evaluateRegisteredChallenge({
    challengeId: 'mod-2-aula-11',
    files: { 'script.js': 'function encontrarMaior_11(numeros) { return numeros.concat(...numeros); }' }
  }), { ok: false, reason: 'unsupported-call' });
  assert.deepEqual(evaluateRegisteredChallenge({
    challengeId: 'mod-2-aula-7',
    files: { 'script.js': 'function formatarMoedaBRL_7(valor) { return valor.toFixed(8); }' }
  }), { ok: false, reason: 'unsupported-call' });
});


test('evaluates the authored module-five admin middleware lesson', () => {
  const source = `function verificarAdmin(req, res, next) {
    if (!req.headers?.authorization?.startsWith("Bearer ")) {
      return res.status(401).json({ erro: "Não autorizado" });
    }
    if (req.usuario?.cargo !== "admin") {
      return res.status(403).json({ erro: "Acesso restrito" });
    }
    next();
  }`;
  assert.deepEqual(evaluateRegisteredChallenge({
    challengeId: 'auth-01-middleware-admin',
    files: { 'authMiddleware.js': source }
  }), { ok: true });
});
