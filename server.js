// ============================================
// NEXUS FINANCE BACKEND - SERVIDOR DE PAGAMENTOS
// ============================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const mercadopago = require('mercadopago');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// CONFIGURAÇÃO
// ============================================

// CORS
const allowedOrigins = [
    process.env.FRONTEND_URL,<span class="cursor">█</span>
