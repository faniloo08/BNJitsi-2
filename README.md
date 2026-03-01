# 🎥 JaaS Meet Platform

Plateforme de visioconférence professionnelle utilisant Jitsi as a Service (JaaS) avec système d'invitations par email et intégration Google Calendar.

## ✨ Fonctionnalités

- 🎥 **Visioconférence HD** avec Jitsi as a Service
- 📅 **Planification de réunions** avec date, heure et durée
- 📧 **Invitations automatiques par email** (EmailJS)
- 📆 **Intégration Google Calendar** (lien direct dans les emails)
- 👥 **Gestion des participants** et acceptation d'invitations
- 🔒 **Authentification sécurisée** avec JWT
- ⏳ **Indicateur de chargement** sécurisé lors de l'accès aux salles
- 📱 **Support PWA basique** avec manifest.json
- 💾 **Stockage persistant** des réunions
- 🚫 **Messages privés désactivés** (chat public uniquement)

## 🏗️ Architecture

```
├── backend/           # Serveur Node.js pour JWT
│   ├── server.js      # API Express + génération JWT
│   └── .env           # Configuration (ignoré par Git)
│
└── frontend/          # Application React
    ├── src/
    │   └── App.js     # Composant principal
    ├── public/
    │   └── index.html # Chargement script Jitsi
    └── .env           # Configuration (ignoré par Git)
```

## 🚀 Installation

### Prérequis

- Node.js 14+
- Compte JaaS : [https://jaas.8x8.vc/](https://jaas.8x8.vc/)
- Compte EmailJS : [https://www.emailjs.com/](https://www.emailjs.com/) (optionnel)

### 1. Cloner le projet

```bash
git clone https://github.com/VOTRE_USERNAME/VOTRE_REPO.git
cd VOTRE_REPO
```

### 2. Configuration Backend

```bash
cd backend

# Installer les dépendances
npm install

# Créer le fichier .env depuis le template
cp .env.example .env

# Éditer .env avec vos vraies valeurs JaaS
nano .env
```

**Variables requises dans `backend/.env` :**
```env
JAAS_APP_ID=vpaas-magic-cookie-XXXXXXXXXXXXXXXX
JAAS_API_KEY=vpaas-magic-cookie-XXXXXXXXXXXXXXXX/XXXXXX
PRIVATE_KEY_PATH=./private.key
PORT=3001
```

**Important :** Téléchargez votre clé privée depuis [JaaS Dashboard](https://jaas.8x8.vc/#/apikeys) et placez-la dans `backend/private.key`.

### 3. Configuration Frontend

```bash
cd ../frontend

# Installer les dépendances
npm install

# Créer le fichier .env depuis le template
cp .env.example .env

# Éditer .env
nano .env
```

**Variables requises dans `frontend/.env` :**
```env
REACT_APP_JWT_API_URL=http://localhost:3001
REACT_APP_JAAS_APP_ID=vpaas-magic-cookie-XXXXXXXXXXXXXXXX
REACT_APP_EMAILJS_SERVICE=service_XXXXXXX
REACT_APP_EMAILJS_TEMPLATE=template_XXXXXXX
REACT_APP_EMAILJS_PUBLIC=XXXXXXXXXXXXXXXXXX
```

**Important :** `REACT_APP_JAAS_APP_ID` doit être **identique** à celui du backend.

### 4. Modifier `public/index.html`

Ouvrez `frontend/public/index.html` et remplacez l'APP_ID dans le script Jitsi :

```html
<script src="https://8x8.vc/VOTRE_APP_ID/external_api.js"></script>
```

### 5. Lancer l'application

**Terminal 1 - Backend :**
```bash
cd backend
npm start
```

**Terminal 2 - Frontend :**
```bash
cd frontend
npm start
```

L'application sera accessible sur [http://localhost:3000](http://localhost:3000)

## 🧪 Test

### Vérifier le backend
```bash
curl http://localhost:3001/health
```

Doit retourner :
```json
{
  "status": "ok",
  "jaasAppId": "✅ Configured",
  "apiKey": "✅ Configured",
  "privateKey": "✅ Loaded"
}
```

### Créer une réunion de test
1. Ouvrez [http://localhost:3000](http://localhost:3000)
2. Connectez-vous avec un email et pseudo
3. Cliquez sur "Nouveau Meet"
4. Remplissez les informations
5. Ajoutez un email d'invitation
6. Cliquez sur "Créer et envoyer"
7. Rejoignez la réunion créée

## 📦 Déploiement

### Backend sur Render

1. Créez un compte sur [Render.com](https://render.com)
2. Créez un nouveau "Web Service"
3. Connectez votre repository GitHub
4. Configurez :
   - **Build Command :** `npm install`
   - **Start Command :** `npm start`
   - **Root Directory :** `backend`

5. Ajoutez les variables d'environnement dans Render :
   ```
   JAAS_APP_ID=votre-app-id
   JAAS_API_KEY=votre-api-key
   PORT=3001
   NODE_ENV=production
   PRIVATE_KEY=-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----
   ```

6. Déployez !

### Frontend sur Vercel

1. Créez un compte sur [Vercel.com](https://vercel.com)
2. Importez votre repository
3. Configurez :
   - **Framework :** Create React App
   - **Root Directory :** `frontend`
   - **Build Command :** `npm run build`
   - **Output Directory :** `build`

4. Ajoutez les variables d'environnement :
   ```
   REACT_APP_JWT_API_URL=https://votre-backend.onrender.com
   REACT_APP_JAAS_APP_ID=votre-app-id
   REACT_APP_EMAILJS_SERVICE=votre-service-id
   REACT_APP_EMAILJS_TEMPLATE=votre-template-id
   REACT_APP_EMAILJS_PUBLIC=votre-public-key
   ```

5. Déployez !

## 🔧 Configuration

### Désactiver les messages privés

Les messages privés sont déjà désactivés dans la configuration. Si vous souhaitez les réactiver, modifiez dans `App.js` :

```javascript
configOverwrite: {
  disablePrivateMessages: false,  // true = désactivé, false = activé
}
```

### Personnaliser l'interface

Modifiez les options dans `initJitsi()` :

```javascript
configOverwrite: {
  startWithAudioMuted: true,        // Micro coupé au démarrage
  startWithVideoMuted: true,        // Caméra éteinte au démarrage
  resolution: 720,                  // Qualité vidéo
  defaultLanguage: 'fr',            // Langue
  // ... autres options
}
```

Voir [Options de Configuration Jitsi](./JITSI_CONFIG.md) pour plus de détails.

## 🛡️ Sécurité

### ⚠️ IMPORTANT

- ✅ Ne commitez **JAMAIS** vos fichiers `.env`
- ✅ Ne commitez **JAMAIS** votre `private.key`
- ✅ Utilisez les variables d'environnement en production
- ✅ Gardez votre repository **private** si vous ne pouvez pas séparer les secrets
- ✅ Régénérez vos clés si elles sont exposées

### Fichiers sensibles (dans .gitignore)

```
.env
.env.local
.env.*
*.key
private.key
```

### CORS en production

Le backend accepte uniquement les requêtes depuis les domaines autorisés. Modifiez `ALLOWED_ORIGINS` dans votre `.env` :

```env
ALLOWED_ORIGINS=https://votre-app.vercel.app,https://votre-domaine.com
```

## 📚 Documentation

- [Guide d'Installation Complet](./GUIDE_INSTALLATION.md)
- [Options de Configuration Jitsi](./JITSI_CONFIG.md)
- [Guide Git et Sécurité](./GIT_SETUP.md)
- [Documentation JaaS](https://developer.8x8.com/jaas/docs)
- [Documentation Jitsi External API](https://jitsi.github.io/handbook/docs/dev-guide/dev-guide-iframe)

## 🐛 Problèmes courants

### "Impossible de récupérer le JWT du backend"
- Vérifiez que le backend est démarré (`npm start` dans `backend/`)
- Vérifiez l'URL dans `REACT_APP_JWT_API_URL`

### "JitsiMeetExternalAPI non chargé"
- Vérifiez que `index.html` contient le bon script avec votre APP_ID
- Videz le cache du navigateur (Ctrl + F5)

### Erreur 401 ou "Invalid JWT"
- Vérifiez que `JAAS_APP_ID` est identique dans backend et frontend
- Vérifiez que la `private.key` est correcte
- Vérifiez les logs du backend pour plus de détails

### Les messages privés apparaissent encore
- Videz le cache du navigateur
- Vérifiez que `disablePrivateMessages: true` est bien dans les options
- Redémarrez React (`Ctrl+C` puis `npm start`)

## 🤝 Contribution

Les contributions sont les bienvenues ! Veuillez :

1. Forker le projet
2. Créer une branche (`git checkout -b feature/AmazingFeature`)
3. Commiter vos changements (`git commit -m 'Add AmazingFeature'`)
4. Pusher vers la branche (`git push origin feature/AmazingFeature`)
5. Ouvrir une Pull Request

## 📝 License

Ce projet est sous licence MIT.

## 👨‍💻 Auteur

**Votre Nom** - [GitHub](https://github.com/VOTRE_USERNAME)

## 🙏 Remerciements

- [Jitsi](https://jitsi.org/) pour leur excellente solution de visioconférence
- [8x8](https://www.8x8.com/) pour JaaS (Jitsi as a Service)
- [EmailJS](https://www.emailjs.com/) pour l'envoi d'emails côté client

## 📞 Support

Pour toute question ou problème :
- Ouvrez une [Issue](https://github.com/VOTRE_USERNAME/VOTRE_REPO/issues)
- Consultez la [Documentation JaaS](https://developer.8x8.com/jaas/docs)
- Rejoignez la [Communauté Jitsi](https://community.jitsi.org/)

---

⭐ Si ce projet vous aide, n'hésitez pas à le star sur GitHub !