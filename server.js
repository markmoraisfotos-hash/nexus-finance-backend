require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { MercadoPagoConfig, Payment } = require('mercadopago');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// CONFIGURAÇÃO DO MERCADO PAGO (SDK v2)
// ============================================
const accessToken = process.env.ENVIRONMENT === 'production'
    ? process.env.MERCADOPAGO_ACCESS_TOKEN_PROD
    : process.env.MERCADOPAGO_ACCESS_TOKEN_TEST;

const client = new MercadoPagoConfig({ 
    accessToken: accessToken,
    options: { timeout: 5000 }
});

const payment = new Payment(client);

// ============================================
// MIDDLEWARES
// ============================================
app.use(cors({
    origin: process.env.FRONTEND_URL || '*',
    credentials: true
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// ============================================
// ENDPOINTS
// ============================================

// Health Check
app.get('/', (req, res) => {
    res.send('✅ Nexus Finance Backend Online');
});

// Status do servidor
app.get('/status', (req, res) => {
    res.json({
        status: 'online',
        environment: process.env.ENVIRONMENT || 'test',
        timestamp: new Date().toISOString(),
        mercadopago_configured: !!accessToken
    });
});

// ============================================
// CRIAR PAGAMENTO PIX
// ============================================
app.post('/criar-pagamento-pix', async (req, res) => {
    try {
        const { amount, description, email, name, cpf } = req.body;

        console.log('💳 Criando pagamento PIX:', { amount, description, email });

        const body = {
            transaction_amount: parseFloat(amount),
            description: description,
            payment_method_id: 'pix',
            payer: {
                email: email,
                first_name: name,
                identification: {
                    type: 'CPF',
                    number: cpf
                }
            }
        };

        const result = await payment.create({ body });

        console.log('✅ Pagamento PIX criado:', result.id);

        res.json({
            success: true,
            payment_id: result.id,
            status: result.status,
            qr_code: result.point_of_interaction?.transaction_data?.qr_code,
            qr_code_base64: result.point_of_interaction?.transaction_data?.qr_code_base64
        });

    } catch (error) {
        console.error('❌ Erro ao criar pagamento PIX:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================
// PROCESSAR PAGAMENTO COM CARTÃO
// ============================================
app.post('/processar-cartao', async (req, res) => {
    try {
        const { token, amount, installments, email, name, cpf } = req.body;

        console.log('💳 Processando pagamento com cartão:', { amount, installments, email });

        const body = {
            transaction_amount: parseFloat(amount),
            token: token,
            installments: parseInt(installments),
            payer: {
                email: email,
                identification: {
                    type: 'CPF',
                    number: cpf
                }
            }
        };

        const result = await payment.create({ body });

        console.log('✅ Pagamento processado:', result.id, result.status);

        res.json({
            success: true,
            payment_id: result.id,
            status: result.status,
            status_detail: result.status_detail
        });

    } catch (error) {
        console.error('❌ Erro ao processar cartão:', error);
        res.status(500).json({
            success: false,
            error: error.message
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

        const result = await payment.get({ id: payment_id });

        res.json({
            success: true,
            payment_id: result.id,
            status: result.status,
            status_detail: result.status_detail,
            amount: result.transaction_amount,
            payer_email: result.payer?.email
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
// WEBHOOK (Recebe notificações do Mercado Pago)
// ============================================
app.post('/webhook', async (req, res) => {
    try {
        const { type, data } = req.body;

        console.log('📬 Webhook recebido:', type, data);

        // Responde rápido para o Mercado Pago
        res.sendStatus(200);

        // Processa notificação em background
        if (type === 'payment') {
            const result = await payment.get({ id: data.id });
            
            console.log('💰 Status do pagamento:', result.status);

            if (result.status === 'approved') {
                console.log('✅ Pagamento aprovado! Ativando assinatura...');
                // Aqui você ativaria a assinatura do usuário no Firebase
                // await ativarAssinatura(result.payer.email);
            }
        }

    } catch (error) {
        console.error('❌ Erro no webhook:', error);
    }
});

// ============================================
// INICIAR SERVIDOR
// ============================================
app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
    console.log(`✅ Ambiente: ${process.env.ENVIRONMENT || 'test'}`);
    console.log(`✅ Mercado Pago configurado: ${!!accessToken}`);
});
