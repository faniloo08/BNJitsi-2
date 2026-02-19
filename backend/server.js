// server.js - Backend pour générer les JWT JaaS
const express = require('express');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const cors = require('cors');
require('dotenv').config();

const app = express();
// CORS sécurisé pour production
const allowedOrigins = [
  'http://localhost:3000', // Dev local
  'https://bnj-itsi-2.vercel.app', // Production
];

app.use(cors({
  origin: function(origin, callback) {
    // Autoriser les requêtes sans origin (comme Postman)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Non autorisé par CORS'));
    }
  },
  credentials: true
}));

app.use(express.json());

// Configuration JaaS depuis .env
const JAAS_APP_ID = process.env.JAAS_APP_ID; // Ex: vpaas-magic-cookie-adc32f2732de47b3bdf19305d2e91523
const JAAS_API_KEY = process.env.JAAS_API_KEY; // Votre API Key ID
const PRIVATE_KEY_PATH = process.env.PRIVATE_KEY_PATH || './private.key';

// Charger la clé privée
let privateKey;
try {
  // En production, utiliser la variable d'environnement
  if (process.env.PRIVATE_KEY) {
    privateKey = process.env.PRIVATE_KEY.replace(/\\n/g, '\n');
    console.log('✅ Clé privée chargée depuis variable d\'environnement');
  } else {
    // En dev, utiliser le fichier
    privateKey = fs.readFileSync(PRIVATE_KEY_PATH, 'utf8');
    console.log('✅ Clé privée chargée depuis fichier');
  }
} catch (error) {
  console.error('❌ Erreur lors du chargement de la clé privée:', error.message);
  process.exit(1);
}

/**
 * Génère un JWT pour JaaS
 * @param {Object} user - Informations utilisateur
 * @param {string} room - Nom de la salle (simple, sans tenant)
 * @returns {string} JWT signé
 */
function generateJaasJWT(user, room) {
  const now = Math.floor(Date.now() / 1000);
  
  // Structure du JWT pour JaaS
  const payload = {
    // Claims standards
    iss: 'chat',
    aud: 'jitsi',
    sub: JAAS_APP_ID, // Votre AppID (tenant)
    room: '*', // Wildcard pour permettre toutes les salles (ou spécifiez le nom exact)
    exp: now + 7200,
    nbf: now - 30,
    
    // Context spécifique à l'utilisateur
    context: {
      user: {
        id: user.id || user.email || `user-${Date.now()}`,
        name: user.name || user.pseudo || 'Invité',
        email: user.email || '',
        avatar: user.avatar || '',
        moderator: user.moderator !== undefined ? String(user.moderator) : "false"
      },
      features: {
        recording: user.canRecord ? "true" : "false",
        livestreaming: user.canStream ? "true" : "false",
        transcription: user.canTranscribe ? "true" : "false",
        'outbound-call': user.canCall ? "true" : "false"
      }
    }
  };

  // Header du JWT
  const header = {
    alg: 'RS256',
    typ: 'JWT',
    kid: JAAS_API_KEY // Votre API Key ID
  };

  // Signer le JWT avec la clé privée
  const token = jwt.sign(payload, privateKey, {
    algorithm: 'RS256',
    header: header
  });

  return token;
}

/**
 * Endpoint pour générer un JWT
 * POST /api/generate-jwt
 * Body: { user: {...}, room: "room-name" }
 */
app.post('/api/generate-jwt', (req, res) => {
  try {
    const { user, room } = req.body;

    // Validation
    if (!user || !user.name) {
      return res.status(400).json({
        error: 'User information is required (at least user.name)'
      });
    }

    if (!room) {
      return res.status(400).json({
        error: 'Room name is required'
      });
    }

    // Normaliser le nom de la salle (minuscules, pas de slash)
    const normalizedRoom = String(room).trim().toLowerCase().replace(/\//g, '-');

    console.log('🔐 Génération JWT pour:', {
      user: user.name,
      room: normalizedRoom,
      appId: JAAS_APP_ID
    });

    // Générer le JWT
    const token = generateJaasJWT(user, normalizedRoom);

    res.json({
      jwt: token,
      room: normalizedRoom,
      expiresIn: 7200
    });
  } catch (error) {
    console.error('❌ Erreur lors de la génération du JWT:', error);
    res.status(500).json({
      error: 'Failed to generate JWT',
      message: error.message
    });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    jaasAppId: JAAS_APP_ID ? '✅ Configured' : '❌ Missing',
    apiKey: JAAS_API_KEY ? '✅ Configured' : '❌ Missing',
    privateKey: privateKey ? '✅ Loaded' : '❌ Missing'
  });
});

// Démarrer le serveur
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Serveur JWT JaaS démarré sur le port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
  console.log(`🔑 Endpoint JWT: http://localhost:${PORT}/api/generate-jwt`);
  
  if (!JAAS_APP_ID || !JAAS_API_KEY) {
    console.warn('⚠️  ATTENTION: Variables d\'environnement manquantes!');
    console.warn('   Configurez JAAS_APP_ID et JAAS_API_KEY dans .env');
  }
});

// Ajoutez cette route dans votre server.js

// Route de réveil spécifique pour Make
app.get('/api/wake-up', (req, res) => {
  console.log('🔔 Backend réveillé par Make à:', new Date().toISOString());
  res.json({
    status: 'awake',
    message: 'Backend is ready for meetings',
    timestamp: Date.now(),
    uptime: process.uptime()
  });
});

// Health check amélioré
app.get('/health', (req, res) => {
  console.log('💚 Health check appelé à:', new Date().toISOString());
  res.json({
    status: 'ok',
    jaasAppId: JAAS_APP_ID ? '✅ Configured' : '❌ Missing',
    apiKey: JAAS_API_KEY ? '✅ Configured' : '❌ Missing',
    privateKey: privateKey ? '✅ Loaded' : '❌ Missing',
    timestamp: Date.now(),
    uptime: process.uptime()
  });
});

app.get('/api/preflight', (req, res) => {
  res.json({
    status: 'ok',
    serverTime: Date.now(),
    configured: !!(JAAS_APP_ID && JAAS_API_KEY && privateKey)
  });
});