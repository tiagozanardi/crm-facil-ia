import 'dotenv/config';
import { app } from './app.js';

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`🚀 CRM Fácil IA - Backend Express rodando na porta ${PORT}`);
  console.log(`📡 Health check: http://localhost:${PORT}/api/health`);
  console.log(`📦 Produtos API: http://localhost:${PORT}/api/products`);
});
