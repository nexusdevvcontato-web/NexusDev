const mongoose = require('mongoose');

const uri = process.env.MONGO_SESSION_TEST_URI;
if (!uri) throw new Error('MONGO_SESSION_TEST_URI é obrigatório.');

const parsed = new URL(uri);
const database = parsed.pathname.replace(/^\//, '');
if (!['127.0.0.1', 'localhost'].includes(parsed.hostname) ||
    database !== 'nexusdev_session_test' ||
    parsed.searchParams.get('replicaSet') !== 'rs0') {
  throw new Error('Inicialização permitida somente para nexusdev_session_test local no replica set rs0.');
}

async function main() {
  const initUrl = new URL(uri);
  initUrl.searchParams.delete('replicaSet');
  initUrl.searchParams.set('directConnection', 'true');
  const connection = await mongoose.createConnection(initUrl.toString(), {
    serverSelectionTimeoutMS: 5000
  }).asPromise();
  try {
    const admin = connection.db.admin();
    let initialized = false;
    try {
      const status = await admin.command({ replSetGetStatus: 1 });
      initialized = status.ok === 1;
    } catch (error) {
      if (![94, 76].includes(error.code)) throw error;
    }
    if (!initialized) {
      await admin.command({
        replSetInitiate: {
          _id: 'rs0',
          members: [{ _id: 0, host: '127.0.0.1:27017' }]
        }
      });
    }

    let primary = false;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      try {
        const hello = await admin.command({ hello: 1 });
        if (hello.isWritablePrimary) { primary = true; break; }
      } catch {}
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    if (!primary) throw new Error('MongoDB replica set não elegeu primary em 30 segundos.');
  } finally {
    await connection.close();
  }
}

main().catch(error => {
  process.stderr.write(`Falha ao inicializar replica set de testes: ${error.message}\n`);
  process.exitCode = 1;
});
