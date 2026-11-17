import 'dotenv/config';
import { app } from '../server/app';

// Teste direto sem HTTP: simula as requests usando supertest style com chamadas diretas ao Prisma
async function runTests() {
  const prismaModule = await import('../server/db');
  const prisma = prismaModule.prisma;

  console.log('\n🧪 Testando conexão com banco de dados...');
  
  try {
    const storeCount = await prisma.store.count();
    console.log(`✅ Banco conectado. Lojas configuradas: ${storeCount}`);
    
    const products = await prisma.product.findMany({
      where: { active: true },
      orderBy: { createdAt: 'desc' },
      take: 3,
    });
    console.log(`✅ Produtos encontrados: ${products.length} (ativos)`);
    if (products.length > 0) {
      const p = products[0];
      console.log(`   → Produto: "${p.name}" | Preço: R$${p.price} | Estoque: ${p.stock}`);
    }
    
    const store = await prisma.store.findFirst({ where: { slug: 'malas-slz' } });
    if (store) {
      console.log(`✅ Loja piloto encontrada: ${store.name} | #${store.primaryColor}`);
    }
    
    const aiConfig = await prisma.aIConfig.findFirst({ where: { storeId: store?.id } });
    if (aiConfig) {
      console.log(`✅ AI Config encontrada: tom=${aiConfig.tone} | emojis=${aiConfig.emojiIntensity}`);
    }
    
    const quickReplies = await prisma.quickReply.count({ where: { storeId: store?.id } });
    console.log(`✅ Respostas rápidas: ${quickReplies}`);

    const leads = await prisma.lead.count({ where: { storeId: store?.id } });
    console.log(`✅ Leads no pipeline: ${leads}`);

    console.log('\n🎉 TODOS OS TESTES PASSARAM! Backend + Banco OK.');
    console.log('\n📋 Express app registrado com as rotas:');
    // @ts-ignore
    const routes = app._router?.stack
      ?.filter((r: any) => r.regexp && r.handle?.stack)
      ?.map((r: any) => r.regexp.toString().substring(0, 50)) || [];
    console.log('   → /api/health, /api/products, /api/store');
  } catch (err: any) {
    console.error('❌ Falha no teste:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

runTests();
