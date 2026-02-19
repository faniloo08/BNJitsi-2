import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Calendar, Users, Video, Send, X, Plus, Check, Clock, Mail, AlertCircle, CalendarPlus, Pencil, Save, Trash2 } from 'lucide-react';
import emailjs from '@emailjs/browser';

// Configuration EmailJS
const EMAILJS_CONFIG = {
  serviceId: process.env.REACT_APP_EMAILJS_SERVICE || "service_ku5gvjs",
  templateId: process.env.REACT_APP_EMAILJS_TEMPLATE || "template_i979cae",
  publicKey: process.env.REACT_APP_EMAILJS_PUBLIC || "aH7OeR0t5BKb_rfZc"
};

// Configuration JaaS
const JAAS_CONFIG = {
  appId: process.env.REACT_APP_JAAS_APP_ID || 'vpaas-magic-cookie-adc32f2732de47b3bdf19305d2e91523',
  jwtApiUrl: process.env.REACT_APP_JWT_API_URL || 'http://localhost:3001',
  domain: '8x8.vc'
};

// Configuration Make Webhook
const MAKE_CONFIG = {
  webhookUrl: process.env.REACT_APP_MAKE_WEBHOOK_URL || 'YOUR_MAKE_WEBHOOK_URL'
};

// ---------------------------------------------------------------------------
// Helpers : pré-chargement, compatibilité navigateur, diagnostic réseau
// ---------------------------------------------------------------------------

let jitsiScriptLoaded = false;
let jitsiScriptPromise = null;

function preloadJitsiScript() {
  if (jitsiScriptLoaded || jitsiScriptPromise) return jitsiScriptPromise;
  jitsiScriptPromise = new Promise((resolve, reject) => {
    if (window.JitsiMeetExternalAPI) { jitsiScriptLoaded = true; resolve(); return; }
    const s = document.createElement('script');
    s.src = `https://${JAAS_CONFIG.domain}/external_api.js`;
    s.async = true;
    s.onload = () => { jitsiScriptLoaded = true; resolve(); };
    s.onerror = () => reject(new Error('Impossible de charger le script Jitsi'));
    document.head.appendChild(s);
  });
  return jitsiScriptPromise;
}

function addDnsPrefetch() {
  const domains = [JAAS_CONFIG.domain, `olocation-oem.ocloud.8x8.vc`];
  domains.forEach(d => {
    if (!document.querySelector(`link[href="https://${d}"]`)) {
      const link = document.createElement('link');
      link.rel = 'preconnect';
      link.href = `https://${d}`;
      link.crossOrigin = 'anonymous';
      document.head.appendChild(link);
    }
  });
}

function checkBrowserCompatibility() {
  const errors = [];
  if (!window.RTCPeerConnection) errors.push('WebRTC non supporté par ce navigateur.');
  if (!navigator.mediaDevices?.getUserMedia) errors.push('L\'accès caméra/micro n\'est pas disponible.');

  const ua = navigator.userAgent;
  const isOldIE = /MSIE|Trident/.test(ua);
  const isOldSafari = /Safari/.test(ua) && !/Chrome/.test(ua) && /Version\/[0-9]\./.test(ua);
  if (isOldIE) errors.push('Internet Explorer n\'est pas supporté. Utilisez Chrome, Firefox ou Edge.');
  if (isOldSafari) errors.push('Votre version de Safari est trop ancienne. Mettez-la à jour ou utilisez Chrome/Firefox.');

  return errors;
}

async function runPreflightCheck(backendUrl) {
  const results = { backend: false, jitsiScript: false, webrtc: false, clockDrift: 0 };

  try {
    const t0 = Date.now();
    const resp = await fetch(`${backendUrl}/api/preflight`, { signal: AbortSignal.timeout(5000) });
    if (resp.ok) {
      const data = await resp.json();
      results.backend = true;
      results.clockDrift = Math.abs(Date.now() - data.serverTime);
    }
    results.backendLatency = Date.now() - t0;
  } catch { /* backend unreachable */ }

  results.jitsiScript = !!window.JitsiMeetExternalAPI;
  results.webrtc = !!window.RTCPeerConnection;
  return results;
}

const JitsiMeetPlatform = () => {
  const [view, setView] = useState('home');
  const [meets, setMeets] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [showCreateMeet, setShowCreateMeet] = useState(false);
  const [activeMeet, setActiveMeet] = useState(null);
  const [sendingEmails, setSendingEmails] = useState(false);
  const jitsiContainerRef = useRef(null);
  const jitsiApiRef = useRef(null);
  const [connectionStatus, setConnectionStatus] = useState(null); // null | 'connecting' | 'connected' | 'error'
  const [connectionError, setConnectionError] = useState(null);
  const retryCountRef = useRef(0);
  const MAX_RETRIES = 2;

  // Pré-chargement au montage de l'application
  useEffect(() => {
    addDnsPrefetch();
    preloadJitsiScript().catch(() => {});
    // Wake-up backend pour éliminer le cold-start
    fetch(`${JAAS_CONFIG.jwtApiUrl}/api/preflight`).catch(() => {});
  }, []);

  const [meetForm, setMeetForm] = useState({
    title: '',
    date: '',
    time: '',
    duration: '60',
    invitees: ['']
  });

  const [showParticipants, setShowParticipants] = useState(null);
  const [showEditMeet, setShowEditMeet] = useState(false);
  const [editMeetForm, setEditMeetForm] = useState(null);

  // Obtenir le nombre total de participants (organisateur + tous les invités uniques)
  const getTotalParticipants = (meet) => {
    // Obtenir tous les emails invités uniques pour ce meet
    const uniqueInvitees = new Set(
      invitations
        .filter(inv => inv.meetId === meet.id)
        .map(inv => inv.inviteeEmail)
    );

    return 1 + uniqueInvitees.size; // 1 (organisateur) + invités uniques
  };

  // Obtenir la liste complète des participants sans doublons
  const getParticipantsList = (meet) => {
    const participants = [
      {
        email: meet.organizer,
        pseudo: meet.organizerpseudo,
        role: 'Organisateur'
      }
    ];

    // Utiliser un Set pour éviter les doublons d'emails
    const processedEmails = new Set([meet.organizer]);

    // Ajouter les invités
    const meetInvitations = invitations.filter(inv => inv.meetId === meet.id);
    meetInvitations.forEach(inv => {
      if (!processedEmails.has(inv.inviteeEmail)) {
        participants.push({
          email: inv.inviteeEmail,
          pseudo: inv.inviteeEmail.split('@')[0],
          role: 'Invité'
        });
        processedEmails.add(inv.inviteeEmail);
      }
    });

    return participants;
  };

  // Formater l'heure française pour l'affichage
  const formatFrenchTime = (dateStr, timeStr) => {
    // Les heures sont saisies en heure française (UTC+1/+2)
    const frenchDate = new Date(`${dateStr}T${timeStr}:00`);
    return frenchDate.toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });
  };

  // Générer un lien Google Calendar
  const generateGoogleCalendarUrl = (meet, includeGuests = false) => {
    const start = new Date(`${meet.date}T${meet.time}:00`); // Heure française
    const end = new Date(start.getTime() + meet.duration * 60000);

    const formatDate = (date) =>
      date.toISOString().replace(/-|:|\.\d\d\d/g, '');

    const meetLink = `${window.location.origin}?roomName=${meet.roomName}&title=${encodeURIComponent(meet.title)}`;
    const description = `Rejoignez la réunion vidéo :\n${meetLink}\n\nOrganisé par : ${meet.organizerPseudo}`;

    let url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(meet.title)}&details=${encodeURIComponent(description)}&dates=${formatDate(start)}/${formatDate(end)}`;

    if (includeGuests) {
      // Récupérer les emails uniques des invités pour ce meet
      const uniqueInvitees = new Set(
        invitations
          .filter(inv => inv.meetId === meet.id)
          .map(inv => inv.inviteeEmail)
      );

      // Convertir en tableau et joindre par des virgules
      const guests = Array.from(uniqueInvitees).join(',');
      if (guests) {
        url += `&add=${encodeURIComponent(guests)}`;
      }
    }

    return url;
  };

  useEffect(() => {
    if (EMAILJS_CONFIG.publicKey && EMAILJS_CONFIG.publicKey !== 'YOUR_PUBLIC_KEY') {
      emailjs.init(EMAILJS_CONFIG.publicKey);
    }
  }, []);

  useEffect(() => {
    loadData();
    checkForMeetInUrl();
  }, []);

  const checkForMeetInUrl = () => {
    const urlParams = new URLSearchParams(window.location.search);
    const roomName = urlParams.get('roomName');
    const title = urlParams.get('title');

    if (roomName) {
      const pseudo = prompt('Entrez votre prénom :');
      if (pseudo) {
        handleJoinMeet({ roomName, title: title || 'Réunion' }, pseudo);
      }
    }
  };

  const loadData = async () => {
    try {
      const meetsData = localStorage.getItem('meets');
      const invitationsData = localStorage.getItem('invitations');
      const userData = localStorage.getItem('currentUser');

      if (meetsData) setMeets(JSON.parse(meetsData));
      if (invitationsData) setInvitations(JSON.parse(invitationsData));
      if (userData) setCurrentUser(JSON.parse(userData));
    } catch (error) {
      console.log('Initialisation des données');
    }
  };

  const saveData = async (key, data) => {
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch (error) {
      console.error('Erreur de sauvegarde:', error);
    }
  };

  async function sendInvitationEmail(inviteeEmail, meet) {
    try {
      const join_url = `${window.location.origin}?roomName=${meet.roomName}&title=${encodeURIComponent(meet.title)}`;
      const google_calendar_url = generateGoogleCalendarUrl(meet);

      // Formater la date et l'heure en français pour l'email
      const meetDateTime = new Date(`${meet.date}T${meet.time}:00`);
      const formattedDate = meetDateTime.toLocaleDateString('fr-FR', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
      const formattedTime = meetDateTime.toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Europe/Paris'
      });

      const templateParams = {
        to_email: inviteeEmail,
        meet_title: meet.title,
        meet_date: formattedDate,
        meet_time: formattedTime,
        meet_duration: meet.duration,
        organizer_name: currentUser.pseudo,
        organizer_email: currentUser.email,
        join_url,
        google_calendar_url
      };

      const response = await emailjs.send(
        EMAILJS_CONFIG.serviceId,
        EMAILJS_CONFIG.templateId,
        templateParams
      );

      console.log('Email envoyé avec succès:', response);
      return { success: true, email: inviteeEmail };
    } catch (error) {
      console.error('Erreur envoi email:', error);
      return { success: false, email: inviteeEmail, error: error.text || error.message };
    }
  }

  // Envoyer les données de la réunion à Make pour planifier le réveil du backend
  async function sendMeetingToMake(meet) {
    // Ne pas envoyer si l'URL du webhook n'est pas configurée
    if (!MAKE_CONFIG.webhookUrl || MAKE_CONFIG.webhookUrl === 'YOUR_MAKE_WEBHOOK_URL') {
      console.log('Webhook Make non configuré, activation automatique du backend désactivée');
      return { success: false, reason: 'webhook_not_configured' };
    }

    try {
      // Calculer le timestamp exact de la réunion
      const meetingDateTime = new Date(`${meet.date}T${meet.time}:00`);
      const meetingTimestamp = meetingDateTime.getTime();

      const payload = {
        meetId: meet.id,
        roomName: meet.roomName,
        title: meet.title,
        date: meet.date,
        time: meet.time,
        meetingTimestamp: meetingTimestamp,
        organizerEmail: meet.organizer,
        organizerPseudo: meet.organizerpseudo,
        backendUrl: JAAS_CONFIG.jwtApiUrl,
        createdAt: new Date().toISOString()
      };

      console.log('📤 Envoi des données de réunion à Make:', payload);

      const response = await fetch(MAKE_CONFIG.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Erreur Make webhook: ${response.status}`);
      }

      console.log('✅ Réunion envoyée à Make avec succès');
      return { success: true };
    } catch (error) {
      console.error('❌ Erreur envoi à Make:', error);
      return { success: false, error: error.message };
    }
  }

  const handleDeleteMeet = async (meetId) => {
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer cette réunion ?')) {
      return;
    }

    const updatedMeets = meets.filter(m => m.id !== meetId);
    setMeets(updatedMeets);
    await saveData('meets', updatedMeets);

    const updatedInvitations = invitations.filter(inv => inv.meetId !== meetId);
    setInvitations(updatedInvitations);
    await saveData('invitations', updatedInvitations);

    alert('Réunion supprimée avec succès !');
  };

  const handleLogin = (email, pseudo) => {
    const user = { email, pseudo, id: Date.now().toString() };
    setCurrentUser(user);
    saveData('currentUser', user);
  };

  const handleCreateMeet = async () => {
    if (!meetForm.title || !meetForm.date || !meetForm.time) {
      alert('Veuillez remplir tous les champs obligatoires');
      return;
    }

    // Générer un nom de salle unique et simple
    const roomName = `room-${Date.now()}`;

    const newMeet = {
      id: Date.now().toString(),
      ...meetForm,
      organizer: currentUser.email,
      organizerPseudo: currentUser.pseudo,
      roomName: roomName,
      participants: [{ email: currentUser.email, pseudo: currentUser.pseudo, status: 'accepted' }],
      createdAt: new Date().toISOString()
    };

    const updatedMeets = [...meets, newMeet];
    setMeets(updatedMeets);
    await saveData('meets', updatedMeets);

    // Envoyer la réunion à Make pour planifier le réveil du backend
    const makeResult = await sendMeetingToMake(newMeet);
    if (makeResult.success) {
      console.log('✅ Réveil automatique du backend planifié via Make');
    }

    const validInvitees = meetForm.invitees.filter(email => email.trim() && email.includes('@'));

    if (validInvitees.length === 0) {
      setShowCreateMeet(false);
      setMeetForm({ title: '', date: '', time: '', duration: '60', invitees: [''] });
      alert('Meet créé sans invités !');
      return;
    }

    const newInvitations = validInvitees.map(email => ({
      id: `${newMeet.id}-${email}-${Date.now()}`,
      meetId: newMeet.id,
      inviteeEmail: email,
      status: 'pending',
      sentAt: new Date().toISOString()
    }));

    const updatedInvitations = [...invitations, ...newInvitations];
    setInvitations(updatedInvitations);
    await saveData('invitations', updatedInvitations);

    setSendingEmails(true);
    const emailResults = [];

    for (const email of validInvitees) {
      const result = await sendInvitationEmail(email, newMeet);
      emailResults.push(result);
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    setSendingEmails(false);

    const successCount = emailResults.filter(r => r.success).length;
    const failCount = emailResults.filter(r => !r.success).length;

    let message = `Meet créé !\n\n`;
    message += `✅ ${successCount} email(s) envoyé(s) avec succès\n`;
    if (failCount > 0) {
      message += `❌ ${failCount} email(s) en échec\n\n`;
      message += `Emails en échec:\n`;
      emailResults.filter(r => !r.success).forEach(r => {
        message += `- ${r.email}\n`;
      });
    }

    alert(message);

    setShowCreateMeet(false);
    setMeetForm({ title: '', date: '', time: '', duration: '60', invitees: [''] });
  };

  const handleEditMeet = (meet) => {
    // Préparer le formulaire d'édition
    // On récupère TOUS les invités depuis la liste des invitations (invités acceptés ET en attente)
    // Utiliser un Set pour éviter les doublons
    const existingInvitees = [...new Set(
      invitations
        .filter(inv => inv.meetId === meet.id)
        .map(inv => inv.inviteeEmail)
    )];

    setEditMeetForm({
      id: meet.id,
      title: meet.title,
      date: meet.date,
      time: meet.time,
      duration: meet.duration,
      invitees: existingInvitees.length > 0 ? existingInvitees : [''],
      originalMeet: meet
    });
    setShowEditMeet(true);
  };

  const handleUpdateMeet = async () => {
    if (!editMeetForm.title || !editMeetForm.date || !editMeetForm.time) {
      alert('Veuillez remplir tous les champs obligatoires');
      return;
    }

    const updatedMeets = meets.map(m => {
      if (m.id === editMeetForm.id) {
        return {
          ...m,
          title: editMeetForm.title,
          date: editMeetForm.date,
          time: editMeetForm.time,
          duration: editMeetForm.duration,
          // Nous ne modifions pas les participants ici pour le moment, sauf si logique d'ajout complexe
          // Pour faire simple, on garde les participants tels quels ou on gère les ajouts
        };
      }
      return m;
    });

    setMeets(updatedMeets);
    await saveData('meets', updatedMeets);

    // 1. Identifier tous les emails valides et uniques du formulaire pour l'envoi
    const uniqueFormEmails = [...new Set(
      editMeetForm.invitees.filter(email =>
        email.trim() &&
        email.includes('@') &&
        email !== editMeetForm.originalMeet.organizer
      )
    )];

    // 2. Identifier les nouveaux invités (ceux qui n'ont jamais été invités) pour la base de données
    const existingInvitationEmails = invitations
      .filter(inv => inv.meetId === editMeetForm.id)
      .map(inv => inv.inviteeEmail);

    const newInvitees = uniqueFormEmails.filter(email =>
      !existingInvitationEmails.includes(email)
    );

    // 3. Ajouter uniquement les nouveaux à la base de données (pour ne pas fausser l'historique/les stats)
    if (newInvitees.length > 0) {
      const newInvitationObjects = newInvitees.map(email => ({
        id: `${editMeetForm.id}-${email}-${Date.now()}`,
        meetId: editMeetForm.id,
        inviteeEmail: email,
        status: 'pending',
        sentAt: new Date().toISOString()
      }));

      const updatedInvitations = [...invitations, ...newInvitationObjects];
      setInvitations(updatedInvitations);
      await saveData('invitations', updatedInvitations);
    }

    // 4. Envoyer les emails à TOUS les participants du formulaire (Nouveaux + Anciens)
    setSendingEmails(true);
    const emailPromises = uniqueFormEmails.map(email =>
      sendInvitationEmail(email, { ...editMeetForm.originalMeet, ...editMeetForm })
    );

    await Promise.all(emailPromises);
    setSendingEmails(false);

    alert(`Réunion mise à jour et notifications envoyées à ${uniqueFormEmails.length} participant(s).`);

    setShowEditMeet(false);
    setEditMeetForm(null);
  };

  const handleInvitationResponse = async (invitationId, response) => {
    const invitation = invitations.find(inv => inv.id === invitationId);
    const meet = meets.find(m => m.id === invitation.meetId);

    const updatedInvitations = invitations.map(inv =>
      inv.id === invitationId ? { ...inv, status: response } : inv
    );
    setInvitations(updatedInvitations);
    await saveData('invitations', updatedInvitations);

    if (response === 'accepted' && meet) {
      const updatedMeets = meets.map(m =>
        m.id === meet.id
          ? {
            ...m,
            participants: [...m.participants, {
              email: invitation.inviteeEmail,
              pseudo: `User${Math.floor(Math.random() * 1000)}`,
              status: 'accepted'
            }]
          }
          : m
      );
      setMeets(updatedMeets);
      await saveData('meets', updatedMeets);
    }
  };

  const handleJoinMeet = (meet, userPseudo) => {
    setActiveMeet({ ...meet, userPseudo });
    setView('meeting');

    setConnectionStatus('connecting');
    setConnectionError(null);
    retryCountRef.current = 0;
    setTimeout(() => initJitsi(meet, userPseudo), 100);
  };

  async function initJitsi(meet, userPseudo) {
    if (!jitsiContainerRef.current) return;

    // --- Vérification compatibilité navigateur ---
    const browserErrors = checkBrowserCompatibility();
    if (browserErrors.length > 0) {
      setConnectionStatus('error');
      setConnectionError(browserErrors.join('\n'));
      return;
    }

    // Détruire l'instance existante si présente
    if (jitsiApiRef.current) {
      jitsiApiRef.current.dispose();
      jitsiApiRef.current = null;
    }

    // S'assurer que le script Jitsi est chargé
    try {
      await preloadJitsiScript();
    } catch {
      setConnectionStatus('error');
      setConnectionError('Impossible de charger le script Jitsi. Vérifiez votre connexion internet.');
      return;
    }

    let roomSimple = meet?.roomName || `room-${Date.now()}`;
    roomSimple = String(roomSimple).trim().toLowerCase().replace(/\//g, '-');

    // --- Diagnostic réseau rapide ---
    const preflight = await runPreflightCheck(JAAS_CONFIG.jwtApiUrl);
    if (!preflight.backend) {
      setConnectionStatus('error');
      setConnectionError(
        'Le serveur est injoignable. Veuillez réessayer dans quelques instants.\n' +
        'Si le problème persiste, vérifiez votre connexion internet ou contactez l\'administrateur.'
      );
      return;
    }
    if (preflight.clockDrift > 30000) {
      console.warn('Décalage horloge détecté:', preflight.clockDrift, 'ms');
    }

    // --- Demander un JWT au backend ---
    let jaasJwt;
    try {
      const resp = await fetch(`${JAAS_CONFIG.jwtApiUrl}/api/generate-jwt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user: {
            id: currentUser?.id || currentUser?.email || Date.now().toString(),
            name: userPseudo || currentUser?.pseudo || 'Invité',
            email: currentUser?.email || '',
            moderator: false
          },
          room: roomSimple
        })
      });

      if (!resp.ok) {
        const body = await resp.json().catch(() => null);
        console.error('Erreur backend JWT:', body);
        throw new Error('Impossible de récupérer le JWT du backend');
      }

      const data = await resp.json();
      if (!data.jwt) {
        throw new Error('Pas de JWT dans la réponse du backend');
      }
      jaasJwt = data.jwt;
    } catch (err) {
      console.error('Erreur récupération JWT:', err);
      setConnectionStatus('error');
      setConnectionError(
        `Impossible d'obtenir le token de sécurité.\nVérifiez que le backend est démarré sur ${JAAS_CONFIG.jwtApiUrl}`
      );
      return;
    }

    const fullRoomName = `${JAAS_CONFIG.appId}/${roomSimple}`;

    const options = {
      roomName: fullRoomName,
      jwt: jaasJwt,
      parentNode: jitsiContainerRef.current,
      width: '100%',
      height: '100%',
      configOverwrite: {
        startWithAudioMuted: true,
        startWithVideoMuted: true,
        prejoinPageEnabled: false,
        disablePrivateMessages: true,
        // --- Optimisations latence & connexion ---
        enableWelcomePage: false,
        enableClosePage: false,
        disableDeepLinking: true,
        p2p: {
          enabled: true,
          stunServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
          ]
        },
        channelLastN: 4,
        enableLayerSuspension: true,
        resolution: 480,
        constraints: {
          video: { height: { ideal: 480, max: 720, min: 180 } }
        },
        enableNoisyMicDetection: false,
        disableAudioLevels: true,
        toolbarButtons: [
          'camera',
          'desktop',
          'microphone',
          'hangup',
          'participants-pane',
          'raisehand',
          'settings',
          'tileview',
          'fullscreen',
        ]
      },
      interfaceConfigOverwrite: {
        SHOW_JITSI_WATERMARK: false,
        DISABLE_JOIN_LEAVE_NOTIFICATIONS: true,
        MOBILE_APP_PROMO: false,
      },
      userInfo: {
        displayName: userPseudo || currentUser?.pseudo || 'Invité'
      }
    };

    // --- Créer l'instance Jitsi avec handlers d'erreur ---
    try {
      if (!window.JitsiMeetExternalAPI) {
        throw new Error('JitsiMeetExternalAPI non chargé.');
      }

      const api = new window.JitsiMeetExternalAPI(JAAS_CONFIG.domain, options);
      jitsiApiRef.current = api;

      api.addEventListener('videoConferenceJoined', () => {
        setConnectionStatus('connected');
        setConnectionError(null);
        retryCountRef.current = 0;
      });

      api.addEventListener('participantJoined', (p) => {
        console.log('Participant rejoint:', p.displayName || p.id);
      });

      api.addEventListener('readyToClose', () => {
        handleLeaveMeet();
      });

      api.addEventListener('videoConferenceLeft', () => {
        console.log('Conférence quittée');
      });

      api.addEventListener('errorOccurred', (e) => {
        console.error('Erreur Jitsi:', e);
        const errorType = e?.error?.type || e?.type || '';
        const errorMsg = e?.error?.message || e?.message || '';

        if (errorType === 'conference.connectionError' || errorType === 'connection.onerror') {
          if (retryCountRef.current < MAX_RETRIES) {
            retryCountRef.current += 1;
            setConnectionError(`Erreur de connexion. Nouvelle tentative (${retryCountRef.current}/${MAX_RETRIES})...`);
            if (jitsiApiRef.current) { jitsiApiRef.current.dispose(); jitsiApiRef.current = null; }
            setTimeout(() => initJitsi(meet, userPseudo), 2000);
            return;
          }
        }

        setConnectionStatus('error');
        setConnectionError(buildUserFriendlyError(errorType, errorMsg));
      });

    } catch (e) {
      console.error('Erreur création JitsiMeetExternalAPI:', e);
      setConnectionStatus('error');
      setConnectionError(`Impossible d'initialiser la visioconférence: ${e.message}`);
    }
  }

  function buildUserFriendlyError(errorType, errorMsg) {
    if (/onerror|connectionError/i.test(errorType)) {
      return 'Impossible de se connecter au serveur de visioconférence.\n\nVérifiez que :\n- Votre connexion internet est active\n- Votre firewall/VPN ne bloque pas les connexions UDP\n- Vous n\'utilisez pas un proxy TLS restrictif';
    }
    if (/onjwtError|onjwtInvalid|onjwtExpired/i.test(errorType) || /jwt/i.test(errorMsg)) {
      return 'Le token de sécurité a expiré ou est invalide.\nRechargez la page et réessayez.';
    }
    if (/onicefailed|oniceerror/i.test(errorType)) {
      return 'La connexion WebRTC a échoué (ICE).\n\nCela peut être causé par :\n- Un firewall bloquant les ports UDP\n- Un VPN instable\n- Un NAT restrictif\n\nEssayez de désactiver votre VPN ou utilisez un autre réseau.';
    }
    return `Erreur de connexion : ${errorMsg || errorType || 'inconnue'}.\nRechargez la page et réessayez.`;
  }

  const handleLeaveMeet = useCallback(() => {
    if (jitsiApiRef.current) {
      jitsiApiRef.current.dispose();
      jitsiApiRef.current = null;
    }
    setActiveMeet(null);
    setConnectionStatus(null);
    setConnectionError(null);
    retryCountRef.current = 0;
    setView('home');
  }, []);

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-[#590293] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full">
          <div className="text-center mb-8">
            <Video className="w-16 h-16 text-[#590293] mx-auto mb-4" />
            <h1 className="text-3xl font-bold text-gray-800 mb-2">Bienvenue</h1>
            <p className="text-gray-600">Connectez-vous pour organiser vos réunions</p>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
              <input
                type="email"
                id="loginEmail"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#590293] focus:border-transparent"
                placeholder="votre@email.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Pseudo</label>
              <input
                type="text"
                id="loginPseudo"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#590293] focus:border-transparent"
                placeholder="Votre nom d'affichage"
              />
            </div>
            <button
              onClick={() => {
                const email = document.getElementById('loginEmail').value;
                const pseudo = document.getElementById('loginPseudo').value;
                if (email && pseudo && email.includes('@')) {
                  handleLogin(email, pseudo);
                } else {
                  alert('Veuillez remplir tous les champs correctement');
                }
              }}
              className="w-full bg-[#590293] text-white py-3 rounded-lg hover:bg-[#590293] transition font-medium"
            >
              Se connecter
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'meeting' && activeMeet) {
    return (
      <div className="h-screen flex flex-col bg-gray-900">
        <div className="bg-gray-800 p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Video className="w-6 h-6 text-[#590293]" />
            <div>
              <h2 className="text-white font-semibold">{activeMeet.title}</h2>
              <p className="text-gray-400 text-sm">Connecté en tant que: {activeMeet.userPseudo}</p>
            </div>
          </div>
          <button
            onClick={handleLeaveMeet}
            className="bg-red-600 text-white px-6 py-2 rounded-lg hover:bg-red-700 transition flex items-center gap-2"
          >
            <X className="w-5 h-5" />
            Quitter
          </button>
        </div>

        <div className="flex-1 relative">
          {connectionStatus === 'connecting' && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-900 bg-opacity-80 z-10">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-purple-500 border-t-transparent mx-auto mb-4" />
                <p className="text-white text-lg">Connexion en cours...</p>
                <p className="text-gray-400 text-sm mt-1">Préparation de la visioconférence</p>
              </div>
            </div>
          )}
          {connectionStatus === 'error' && connectionError && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-900 bg-opacity-90 z-10">
              <div className="bg-gray-800 rounded-xl p-8 max-w-md text-center shadow-xl border border-red-500/30">
                <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
                <h3 className="text-white text-lg font-semibold mb-3">Erreur de connexion</h3>
                <p className="text-gray-300 text-sm whitespace-pre-line mb-6">{connectionError}</p>
                <div className="flex gap-3 justify-center">
                  <button
                    onClick={() => { setConnectionStatus('connecting'); setConnectionError(null); retryCountRef.current = 0; initJitsi(activeMeet, activeMeet.userPseudo); }}
                    className="bg-purple-600 text-white px-5 py-2 rounded-lg hover:bg-purple-700 transition"
                  >
                    Réessayer
                  </button>
                  <button
                    onClick={handleLeaveMeet}
                    className="bg-gray-600 text-white px-5 py-2 rounded-lg hover:bg-gray-700 transition"
                  >
                    Retour
                  </button>
                </div>
              </div>
            </div>
          )}
          <div ref={jitsiContainerRef} className="w-full h-full" />
        </div>
      </div>
    );
  }

  const myMeets = meets.filter(m =>
    m.organizer === currentUser.email ||
    m.participants.some(p => p.email === currentUser.email)
  );

  const myInvitations = invitations.filter(inv =>
    inv.inviteeEmail === currentUser.email && inv.status === 'pending'
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-[#fff6ea] shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Video className="w-8 h-8 text-[#590293]" />
            <h1 className="text-2xl font-bold text-gray-800">Mes Réunions</h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-gray-600">👋 {currentUser.pseudo}</span>
            <button
              onClick={() => setShowCreateMeet(true)}
              className="bg-[#590293] text-white px-4 py-2 rounded-lg hover:bg-[#f3d01f] hover:text-black transition flex items-center gap-2"
            >
              <Plus className="w-5 h-5" />
              Nouveau Meet
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {EMAILJS_CONFIG.publicKey === 'YOUR_PUBLIC_KEY' && (
          <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-yellow-800">
              <strong>Configuration EmailJS requise :</strong> Veuillez remplacer les valeurs YOUR_SERVICE_ID, YOUR_TEMPLATE_ID et YOUR_PUBLIC_KEY dans le code avec vos clés EmailJS pour activer l'envoi d'emails.
            </div>
          </div>
        )}

        {myInvitations.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <Mail className="w-6 h-6 text-[#590293]" />
              Invitations en attente ({myInvitations.length})
            </h2>
            <div className="space-y-3">
              {myInvitations.map(inv => {
                const meet = meets.find(m => m.id === inv.meetId);
                if (!meet) return null;
                return (
                  <div key={inv.id} className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-gray-800">{meet.title}</h3>
                      <p className="text-sm text-gray-600">
                        Organisé par: {meet.organizerPseudo} • {formatFrenchTime(meet.date, meet.time)}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleInvitationResponse(inv.id, 'accepted')}
                        className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition flex items-center gap-2"
                      >
                        <Check className="w-4 h-4" />
                        Accepter
                      </button>
                      <button
                        onClick={() => handleInvitationResponse(inv.id, 'declined')}
                        className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition flex items-center gap-2"
                      >
                        <X className="w-4 h-4" />
                        Refuser
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <h2 className="text-xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <Calendar className="w-6 h-6 text-[#590293]" />
          Mes réunions ({myMeets.length})
        </h2>

        {myMeets.length === 0 ? (
          <div className="text-center py-12 bg-[#fff6ea] rounded-lg shadow">
            <Calendar className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">Aucune réunion planifiée</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {myMeets.map(meet => (
              <div key={meet.id} className="bg-[#fff6ea] rounded-lg shadow-md p-6 hover:shadow-lg transition">
                <div className="flex items-start justify-between mb-3">
                  <h3 className="font-semibold text-lg text-gray-800">{meet.title}</h3>
                  <div className="flex items-center gap-2">
                    {meet.organizer === currentUser.email && (
                      <button
                        onClick={() => handleEditMeet(meet)}
                        className="bg-purple-100 text-purple-700 hover:bg-purple-200 px-3 py-1 rounded text-sm font-medium flex items-center gap-1 transition-colors"
                      >
                        <Pencil size={14} />
                        Modifier
                      </button>
                    )}
                  </div>
                </div>
                <div className="space-y-2 mb-4 text-sm text-gray-600">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    <span>{formatFrenchTime(meet.date, meet.time)}</span>
                  </div>
                  <button
                    onClick={() => setShowParticipants(meet.id)}
                    className="flex items-center gap-2 hover:text-[#590293] transition-colors cursor-pointer"
                  >
                    <Users className="w-4 h-4" />
                    <span>{getTotalParticipants(meet)} participant(s)</span>
                  </button>
                  <a
                    href={generateGoogleCalendarUrl(meet, true)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 border border-[#590293] text-[#590293] hover:border-[#f3d01f] hover:text-[#f3d01f] font-medium px-4 py-2 rounded-lg transition-colors duration-200"
                  >
                    <CalendarPlus className="w-4 h-4" />
                    <span>Ajouter au Google Calendar</span>
                  </a>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      const pseudo = prompt('Entrez votre prénom pour cette réunion:', currentUser.pseudo);
                      if (pseudo) handleJoinMeet(meet, pseudo);
                    }}
                    className="flex-1 bg-[#590293] text-white py-2 rounded-lg hover:bg-[#f3d01f] hover:text-black transition flex items-center justify-center gap-2"
                  >
                    <Video className="w-5 h-5" />
                    Rejoindre
                  </button>
                  {meet.organizer === currentUser.email && (
                    <button
                      onClick={() => handleDeleteMeet(meet.id)}
                      className="bg-red-100 text-red-600 px-3 py-2 rounded-lg hover:bg-red-200 transition"
                      title="Supprimer la réunion"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showCreateMeet && (
        <div className="fixed inset-0 bg-white bg-opacity-80 flex items-center justify-center p-4 z-50">
          <div className="bg-[#fff6ea] rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b flex items-center justify-between sticky top-0 bg-[#fff6ea]">
              <h2 className="text-2xl font-bold text-gray-800">Créer une réunion</h2>
              <button onClick={() => setShowCreateMeet(false)} className="text-gray-500 hover:text-gray-700">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Titre de la réunion *</label>
                <input
                  type="text"
                  value={meetForm.title}
                  onChange={(e) => setMeetForm({ ...meetForm, title: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f3d01f] focus:border-transparent"
                  placeholder="Ex: Réunion d'équipe hebdomadaire"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Date *</label>
                  <input
                    type="date"
                    value={meetForm.date}
                    onChange={(e) => setMeetForm({ ...meetForm, date: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f3d01f] focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Heure (France UTC+1) *</label>
                  <input
                    type="time"
                    value={meetForm.time}
                    onChange={(e) => setMeetForm({ ...meetForm, time: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f3d01f] focus:border-transparent"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Durée (minutes)</label>
                <input
                  type="number"
                  value={meetForm.duration}
                  onChange={(e) => setMeetForm({ ...meetForm, duration: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f3d01f] focus:border-transparent"
                  placeholder="60"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Mail className="w-4 h-4 inline mr-1" />
                  Invités (emails) - Les invitations seront envoyées automatiquement
                </label>
                {meetForm.invitees.map((email, index) => (
                  <div key={index} className="flex gap-2 mb-2">
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => {
                        const newInvitees = [...meetForm.invitees];
                        newInvitees[index] = e.target.value;
                        setMeetForm({ ...meetForm, invitees: newInvitees });
                      }}
                      className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f3d01f] focus:border-transparent"
                      placeholder="invité@email.com"
                    />
                    {meetForm.invitees.length > 1 && (
                      <button
                        onClick={() => setMeetForm({
                          ...meetForm,
                          invitees: meetForm.invitees.filter((_, i) => i !== index)
                        })}
                        className="text-red-600 hover:text-red-700"
                      >
                        <X className="w-6 h-6" />
                      </button>
                    )}
                  </div>
                ))}
                <button
                  onClick={() => setMeetForm({ ...meetForm, invitees: [...meetForm.invitees, ''] })}
                  className="text-[#590293] hover:text-[#f3d01f] text-sm flex items-center gap-2 mt-2"
                >
                  <Plus className="w-4 h-4" />
                  Ajouter un invité
                </button>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowCreateMeet(false)}
                  disabled={sendingEmails}
                  className="flex-1 px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition disabled:opacity-50"
                >
                  Annuler
                </button>
                <button
                  onClick={handleCreateMeet}
                  disabled={sendingEmails}
                  className="flex-1 bg-[#590293] text-white px-6 py-3 rounded-lg hover:bg-[#f3d01f] hover:text-black transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {sendingEmails ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                      Envoi des emails...
                    </>
                  ) : (
                    <>
                      <Send className="w-5 h-5" />
                      Créer et envoyer
                    </>
                  )}
                </button>
              </div>

              <div className="mt-4 pt-4 border-t text-sm text-gray-500 flex items-center gap-2">
                <CalendarPlus className="w-4 h-4" />
                <span>💡 Un lien Google Calendar sera inclus dans les invitations</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {showEditMeet && editMeetForm && (
        <div className="fixed inset-0 bg-white bg-opacity-80 flex items-center justify-center p-4 z-50">
          <div className="bg-[#fff6ea] rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b flex items-center justify-between sticky top-0 bg-[#fff6ea]">
              <h2 className="text-2xl font-bold text-gray-800">Modifier la réunion</h2>
              <button onClick={() => setShowEditMeet(false)} className="text-gray-500 hover:text-gray-700">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Titre de la réunion *</label>
                <input
                  type="text"
                  value={editMeetForm.title}
                  onChange={(e) => setEditMeetForm({ ...editMeetForm, title: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f3d01f] focus:border-transparent"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Date *</label>
                  <input
                    type="date"
                    value={editMeetForm.date}
                    onChange={(e) => setEditMeetForm({ ...editMeetForm, date: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f3d01f] focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Heure (France UTC+1) *</label>
                  <input
                    type="time"
                    value={editMeetForm.time}
                    onChange={(e) => setEditMeetForm({ ...editMeetForm, time: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f3d01f] focus:border-transparent"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Durée (minutes)</label>
                <input
                  type="number"
                  value={editMeetForm.duration}
                  onChange={(e) => setEditMeetForm({ ...editMeetForm, duration: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f3d01f] focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Mail className="w-4 h-4 inline mr-1" />
                  Ajouter des invités (emails)
                </label>
                {editMeetForm.invitees.map((email, index) => (
                  <div key={index} className="flex gap-2 mb-2">
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => {
                        const newInvitees = [...editMeetForm.invitees];
                        newInvitees[index] = e.target.value;
                        setEditMeetForm({ ...editMeetForm, invitees: newInvitees });
                      }}
                      className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f3d01f] focus:border-transparent"
                      placeholder="nouveau@email.com"
                    />
                    {editMeetForm.invitees.length > 1 && (
                      <button
                        onClick={() => setEditMeetForm({
                          ...editMeetForm,
                          invitees: editMeetForm.invitees.filter((_, i) => i !== index)
                        })}
                        className="text-red-600 hover:text-red-700"
                      >
                        <X className="w-6 h-6" />
                      </button>
                    )}
                  </div>
                ))}
                <button
                  onClick={() => setEditMeetForm({ ...editMeetForm, invitees: [...editMeetForm.invitees, ''] })}
                  className="text-[#590293] hover:text-[#f3d01f] text-sm flex items-center gap-2 mt-2"
                >
                  <Plus className="w-4 h-4" />
                  Ajouter un invité
                </button>
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  onClick={handleUpdateMeet}
                  disabled={sendingEmails}
                  className="flex-1 bg-[#590293] text-white py-3 rounded-lg hover:bg-[#4a027a] transition font-medium flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {sendingEmails ? 'Envoi en cours...' : (
                    <>
                      <Save className="w-5 h-5" />
                      Enregistrer les modifications
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}



      {
        sendingEmails && (
          <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
            <div className="bg-[#fff6ea] rounded-lg p-8 max-w-md text-center">
              <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-[#590293] mx-auto mb-4"></div>
              <h3 className="text-xl font-semibold text-gray-800 mb-2">Envoi des invitations</h3>
              <p className="text-gray-600">Veuillez patienter...</p>
            </div>
          </div>
        )
      }

      {
        showParticipants && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
              <div className="p-6 border-b flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                  <Users className="w-6 h-6 text-[#590293]" />
                  Participants
                </h2>
                <button onClick={() => setShowParticipants(null)} className="text-gray-500 hover:text-gray-700">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="p-6 max-h-96 overflow-y-auto">
                {getParticipantsList(meets.find(m => m.id === showParticipants)).map((participant, index) => (
                  <div key={index} className="flex items-center justify-between py-3 border-b last:border-b-0">
                    <div>
                      <p className="font-medium text-gray-800">{participant.email}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-3 py-1 rounded-full font-medium ${participant.role === 'Organisateur'
                        ? 'bg-purple-100 text-purple-800'
                        : 'bg-blue-100 text-blue-800'
                        }`}>
                        {participant.role}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-4 bg-gray-50 rounded-b-2xl">
                <p className="text-sm text-gray-600 text-center">
                  Total: {getTotalParticipants(meets.find(m => m.id === showParticipants))} participant(s)
                </p>
              </div>
            </div>
          </div>
        )
      }
    </div >
  );
};

export default JitsiMeetPlatform;