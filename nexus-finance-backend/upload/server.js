// ============================================
// NEXUS FINANCE - BACKEND SERVER
// ============================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const mercadopago = require('mercadopago');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// CONFIGURAÇÕES
// ============================================

// CORS - Permitir requisições do frontend
app.use(cors({
    origin: process.env.FRONTEND_URL || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
}));

// Body parser
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Configurar Mercado Pago
const isProduction = process.env.ENVIRONMENT === 'production';
const accessToken = isProduction 
    ? process.env.MERCADOPAGO_ACCESS_TOKEN_PROD 
    : process.env.MERCADOPAGO_ACCESS_TOKEN_TEST;

mercadopago.configure({
    access_token: accessToken
});

console.log(`🔧 Ambiente: ${isProduction ? 'PRODUÇÃO' : 'TESTE'}`);
console.log(`🔑 Access Token: ${accessToken ? accessToken.substring(0, 20) + '...' : 'NÃO CONFIGURADO'}`);

// ============================================
// ROTA PRINCIPAL (TESTE)
// ============================================

app.get('/', (req, res) => {
    res.json({
        status: 'online',
        service: 'Nexus Finance Backend',
        version: '1.0.0',
        environment: isProduction ? 'production' : 'test',
        timestamp: new Date().toISOString()
    });
});

// ============================================
// HEALTH CHECK
// ============================================

app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

// ============================================
// CRIAR PAGAMENTO PIX
// ============================================

app.post('/criar-pagamento-pix', async (req, res) => {
    try {
        const { amount, description, email, name, cpf } = req.body;

        console.log('📱 Criando pagamento PIX:', { amount, email });

        // Validações
        if (!amount || !email) {
            return res.status(400).json({
                success: false,
                error: 'Campos obrigatórios: amount, email'
            });
        }

        // Criar pagamento PIX no Mercado Pago
        const payment = await mercadopago.payment.create({
            transaction_amount: parseFloat(amount),
            description: description || 'Nexus Finance - Assinatura',
            payment_method_id: 'pix',
            payer: {
                email: email,
                first_name: (name || 'Cliente').split(' ')[0],
                last_name: (name || 'Cliente').split(' ').slice(1).join(' ') || 'Nexus',
                identification: {
                    type: 'CPF',
                    number: (cpf || '').replace(/\D/g, '')
                }
            },
            notification_url: `${process.env.WEBHOOK_URL || 'http://localhost:3000/webhook'}`
        });

        console.log('✅ PIX criado:', payment.body.id);

        // Retornar dados do PIX
        res.json({
            success: true,
            payment_id: payment.body.id,
            status: payment.body.status,
            qr_code: payment.body.point_of_interaction.transaction_data.qr_code,
            qr_code_base64: payment.body.point_of_interaction.transaction_data.qr_code_base64,
            ticket_url: payment.body.point_of_interaction.transaction_data.ticket_url,
            expires_at: payment.body.date_of_expiration
        });

    } catch (error) {
        console.error('❌ Erro ao criar PIX:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            details: error.response?.data || null
        });
    }
});

// ============================================
// PROCESSAR PAGAMENTO COM CARTÃO
// ============================================

app.post('/processar-cartao', async (req, res) => {
    try {
        const { 
            token, 
            amount, 
            installments, 
            email, 
            name, 
            cpf,
            description 
        } = req.body;

        console.log('💳 Processando cartão:', { amount, installments, email });

        // Validações
        if (!token || !amount || !email) {
            return res.status(400).json({
                success: false,
                error: 'Campos obrigatórios: token, amount, email'
            });
        }

        // Criar pagamento com cartão
        const payment = await mercadopago.payment.create({
            transaction_amount: parseFloat(amount),
            token: token,
            description: description || 'Nexus Finance - Assinatura',
            installments: parseInt(installments) || 1,
            payment_method_id: 'visa', // Detectado automaticamente
            payer: {
                email: email,
                identification: {
                    type: 'CPF',
                    number: (cpf || '').replace(/\D/g, '')
                }
            },
            notification_url: `${process.env.WEBHOOK_URL || 'http://localhost:3000/webhook'}`
        });

        console.log('✅ Cartão processado:', payment.body.id, 'Status:', payment.body.status);

        res.json({
            success: true,
            payment_id: payment.body.id,
            status: payment.body.status,
            status_detail: payment.body.status_detail,
            amount: payment.body.transaction_amount,
            installments: payment.body.installments
        });

    } catch (error) {
        console.error('❌ Erro ao processar cartão:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            details: error.response?.data || null
        });
    }
});

// ============================================
// VERIFICAR STATUS DE PAGAMENTO
// ============================================

app.get('/verificar-pagamento/:payment_id', async (req, res) => {
    try {
        const { payment_id } = req.params;

        console.log('🔍 Verificando pagamento:', payment_id);

        const payment = await mercadopago.payment.get(payment_id);

        res.json({
            success: true,
            payment_id: payment.body.id,
            status: payment.body.status,
            status_detail: payment.body.status_detail,
            amount: payment.body.transaction_amount,
            payer_email: payment.body.payer.email,
            date_created: payment.body.date_created,
            date_approved: payment.body.date_approved
        });

    } catch (error) {
        console.error('❌ Erro ao verificar pagamento:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================
// WEBHOOK - RECEBER NOTIFICAÇÕES DO MERCADO PAGO
// ============================================

app.post('/webhook', async (req, res) => {
    try {
        const { type, data } = req.body;

        console.log('📩 Webhook recebido:', type, data);

        // Responder imediatamente (Mercado Pago espera resposta rápida)
        res.status(200).send('OK');

        // Processar notificação
        if (type === 'payment') {
            const paymentId = data.id;

            // Buscar detalhes do pagamento
            const payment = await mercadopago.payment.get(paymentId);
            const paymentData = payment.body;

            console.log('💰 Pagamento atualizado:', {
                id: paymentData.id,
                status: paymentData.status,
                email: paymentData.payer.email,
                amount: paymentData.transaction_amount
            });

            // Se pagamento aprovado
            if (paymentData.status === 'approved') {
                console.log('✅ PAGAMENTO APROVADO!');
                
                // AQUI: Ativar assinatura do cliente
                await ativarAssinatura({
                    payment_id: paymentData.id,
                    email: paymentData.payer.email,
                    amount: paymentData.transaction_amount,
                    description: paymentData.description
                });
            }
        }

    } catch (error) {
        console.error('❌ Erro no webhook:', error);
        // Mesmo com erro, responder 200 para não receber novamente
    }
});

// ============================================
// FUNÇÃO: ATIVAR ASSINATURA
// ============================================

async function ativarAssinatura(data) {
    try {
        console.log('🚀 Ativando assinatura:', data.email);

        // TODO: Implementar lógica de ativação
        // 1. Salvar no banco de dados (Firebase/PostgreSQL/etc)
        // 2. Enviar email de boas-vindas
        // 3. Criar credenciais de acesso
        
        // Por enquanto, apenas log
        console.log('✅ Assinatura ativada (simulado):', {
            email: data.email,
            payment_id: data.payment_id,
            amount: data.amount
        });

        // Aqui você pode salvar no Firebase:
        /*
        const admin = require('firebase-admin');
        await admin.firestore().collection('users').add({
            email: data.email,
            plan: detectarPlano(data.amount),
            active: true,
            payment_id: data.payment_id,
            created_at: new Date()
        });
        */

    } catch (error) {
        console.error('❌ Erro ao ativar assinatura:', error);
    }
}

// ============================================
// INICIAR SERVIDOR
// ============================================

app.listen(PORT, () => {
    console.log('\n🚀 ========================================');
    console.log(`   NEXUS FINANCE BACKEND`);
    console.log('   ========================================');
    console.log(`   🌐 Servidor rodando na porta ${PORT}`);
    console.log(`   🔗 http://localhost:${PORT}`);
    console.log(`   📊 Health: http://localhost:${PORT}/health`);
    console.log(`   🔧 Ambiente: ${isProduction ? 'PRODUÇÃO ⚠️' : 'TESTE ✅'}`);
    console.log('   ========================================\n');
});

// Tratamento de erros não capturados
process.on('unhandledRejection', (error) => {
    console.error('❌ Unhandled Rejection:', error);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
    process.exit(1);
});
