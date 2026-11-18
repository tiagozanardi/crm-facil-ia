import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

/**
 * Seed complementar e IDEMPOTENTE de respostas rápidas.
 * Só cria os atalhos que ainda não existem (checagem por shortcut), sem
 * apagar nada. Complementa o seed principal, que cria apenas 4 respostas.
 *
 * Uso: npm run seed:quick-replies
 */
const prisma = new PrismaClient();

const demoQuickReplies = [
  {
    title: 'Medidas Padrão ANAC (10kg)',
    shortcut: '/bordo',
    category: 'medidas',
    content:
      'Nossas malas de bordo atendem 100% ao padrão ANAC (55x35x25cm com rodinhas inclusas). Você embarca tranquilo na LATAM, GOL e AZUL sem risco de despacho obrigatório! ✈️',
  },
  {
    title: 'Garantia e Material Polipropileno',
    shortcut: '/garantia',
    category: 'garantia',
    content:
      'Todas as nossas malas em 100% Polipropileno contam com 2 anos de garantia contra trincas e defeitos de fabricação, além de rodinhas duplas 360° em silicone silencioso. ✨',
  },
  {
    title: 'Condições de Pagamento e Chave Pix',
    shortcut: '/pagamento',
    category: 'pagamento',
    content:
      'Parcelamos em até 10x sem juros no cartão ou você ganha 7% de desconto no Pix imediato! Deseja que eu gere o link com o desconto agora? 💳',
  },
  {
    title: 'Entrega Expressa em São Luís',
    shortcut: '/envio',
    category: 'envio',
    content:
      'Fazemos entrega expressa via motoboy no mesmo dia para toda a Grande Ilha (São Luís, São José de Ribamar, Paço do Lumiar e Raposa). Em compras acima de R$ 350 o frete é grátis! 🛵',
  },
  {
    title: 'Convite Grupo VIP de Descontos',
    shortcut: '/grupovip',
    category: 'precos',
    content:
      'Temos um grupo exclusivo no WhatsApp onde soltamos cupons de 15% a 20% e queima de mostruário semanalmente. Você pode entrar por este link seguro: https://chat.whatsapp.com/MalasSLZ-VIP 🎒',
  },
];

async function main() {
  const store = await prisma.store.findFirst({ where: { slug: 'malas-slz' } });
  if (!store) {
    throw new Error('Loja "malas-slz" não encontrada. Execute o seed principal antes.');
  }

  for (const reply of demoQuickReplies) {
    const existing = await prisma.quickReply.findFirst({
      where: { storeId: store.id, shortcut: reply.shortcut },
    });

    if (existing) {
      console.log(`↷ Já existe, mantendo: ${reply.shortcut} (${existing.title})`);
      continue;
    }

    await prisma.quickReply.create({
      data: {
        storeId: store.id,
        title: reply.title,
        shortcut: reply.shortcut,
        category: reply.category,
        content: reply.content,
      },
    });

    console.log(`✅ Resposta rápida criada: ${reply.shortcut} (${reply.title})`);
  }

  const total = await prisma.quickReply.count({ where: { storeId: store.id } });
  console.log(`\n📊 Total de respostas rápidas na loja ${store.name}: ${total}`);
}

main()
  .catch((error) => {
    console.error('❌ Erro no seed de respostas rápidas:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
