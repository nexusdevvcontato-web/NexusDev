# Testes de integração do Session Store

O teste `test/session-store.mongo.test.js` roda contra MongoDB real quando `MONGO_SESSION_TEST_URI` está definido.

## GitHub Actions

A workflow de segurança inicia um container MongoDB efêmero, inicializa o replica set `rs0` e usa exclusivamente o banco `nexusdev_session_test`. O container é descartado ao final do job. Nenhuma credencial ou banco externo é necessário.

O script `scripts/init-session-test-replica.js` valida host, banco e nome do replica set antes de inicializar. O teste de integração também exige loopback e nome de banco com sufixo `_nexusdev_session_test`.

## Execução local

Use um MongoDB descartável em replica set local e defina:

`MONGO_SESSION_TEST_URI=mongodb://127.0.0.1:27017/nexusdev_session_test?replicaSet=rs0`

Depois execute `node scripts/init-session-test-replica.js` e `npm test`.

**Atenção:** a suíte remove o banco explicitamente nomeado antes e depois do teste. Nunca forneça URI de staging, produção ou banco com dados úteis.

## Cobertura

- criação e persistência do hash;
- rotação de token;
- replay serial e revogação;
- duas rotações concorrentes do mesmo token;
- revogação individual e global.

TTL indexes são apenas limpeza eventual; as operações validam a expiração explicitamente. As transações exigem replica set ou cluster compatível.
