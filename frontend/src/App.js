import React, { useState, useEffect, useRef } from 'react';
import { Calendar, Users, Video, Send, X, Plus, Check, Clock, Mail, AlertCircle, CalendarPlus } from 'lucide-react';
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

  const [meetForm, setMeetForm] = useState({
    title: '',
    date: '',
    time: '',
    duration: '60',
    invitees: ['']
  });

  // Générer un lien Google Calendar
  const generateGoogleCalendarUrl = (meet) => {
    const start = new Date(`${meet.date}T${meet.time}`);
    const end = new Date(start.getTime() + meet.duration * 60000);

    const formatDate = (date) =>
      date.toISOString().replace(/-|:|\.\d\d\d/g, '');

    const meetLink = `${window.location.origin}?roomName=${meet.roomName}&title=${encodeURIComponent(meet.title)}`;
    const description = `Rejoignez la réunion vidéo :\n${meetLink}\n\nOrganisé par : ${meet.organizerPseudo}`;

    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(meet.title)}&details=${encodeURIComponent(description)}&dates=${formatDate(start)}/${formatDate(end)}`;
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
      const pseudo = prompt('Entrez votre pseudo :');
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

      const templateParams = {
        to_email: inviteeEmail,
        meet_title: meet.title,
        meet_date: meet.date,
        meet_time: meet.time,
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
    
    setTimeout(() => initJitsi(meet, userPseudo), 100);
  };

 async function initJitsi(meet, userPseudo) {
  if (!jitsiContainerRef.current) return;

  // Détruire l'instance existante si présente
  if (jitsiApiRef.current) {
    jitsiApiRef.current.dispose();
    jitsiApiRef.current = null;
  }

  // Normaliser le nom de la salle (simple, sans tenant)
  let roomSimple = meet?.roomName || `room-${Date.now()}`;
  roomSimple = String(roomSimple).trim().toLowerCase().replace(/\//g, '-');

  console.log('🚀 Demande de JWT pour la salle:', roomSimple);

  // Demander un JWT au backend
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
      console.error('❌ Erreur backend JWT:', body);
      throw new Error('Impossible de récupérer le JWT du backend');
    }

    const data = await resp.json();
    if (!data.jwt) {
      console.error('❌ Pas de JWT dans la réponse:', data);
      throw new Error('Pas de JWT dans la réponse du backend');
    }
    jaasJwt = data.jwt;
    console.log('✅ JWT reçu avec succès');
  } catch (err) {
    console.error('❌ Erreur récupération JWT:', err);
    alert(`Impossible d'obtenir le token sécurisé.\nVérifiez que le backend est démarré sur ${JAAS_CONFIG.jwtApiUrl}`);
    return;
  }

  // Construire le nom complet de la salle: "<APP_ID>/<roomSimple>"
  const fullRoomName = `${JAAS_CONFIG.appId}/${roomSimple}`;
  console.log('🚀 Connexion à Jitsi:', fullRoomName);

  // Configuration Jitsi avec désactivation des messages privés
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
      
      // 🚫 Désactiver les messages privés
      disablePrivateMessages: true,
    },
    configOverwrite: {
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
        // 'chat',  ← Retirez cette ligne pour désactiver le chat complètement
      ]
    },
    interfaceConfigOverwrite: {
      SHOW_JITSI_WATERMARK: false,
    },
    userInfo: {
      displayName: userPseudo || currentUser?.pseudo || 'Invité'
    }
  };

  // Créer l'instance Jitsi
  try {
    if (!window.JitsiMeetExternalAPI) {
      throw new Error('JitsiMeetExternalAPI non chargé. Vérifiez que le script external_api.js est bien inclus.');
    }

    const api = new window.JitsiMeetExternalAPI(JAAS_CONFIG.domain, options);
    jitsiApiRef.current = api;

    api.addEventListener('videoConferenceJoined', () => {
      console.log('🎉 Connecté à la réunion');
    });

    api.addEventListener('participantJoined', (p) => {
      console.log('👤 Participant rejoint:', p);
    });

    api.addEventListener('readyToClose', () => {
      console.log('👋 Réunion terminée');
      handleLeaveMeet();
    });
  } catch (e) {
    console.error('❌ Erreur création JitsiMeetExternalAPI:', e);
    alert(`Impossible d'initialiser Jitsi: ${e.message}`);
  }
}

  const handleLeaveMeet = () => {
    if (jitsiApiRef.current) {
      jitsiApiRef.current.dispose();
      jitsiApiRef.current = null;
    }
    setActiveMeet(null);
    setView('home');
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full">
          <div className="text-center mb-8">
            <Video className="w-16 h-16 text-indigo-600 mx-auto mb-4" />
            <h1 className="text-3xl font-bold text-gray-800 mb-2">Bienvenue</h1>
            <p className="text-gray-600">Connectez-vous pour organiser vos réunions</p>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
              <input
                type="email"
                id="loginEmail"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="votre@email.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Pseudo</label>
              <input
                type="text"
                id="loginPseudo"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
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
              className="w-full bg-indigo-600 text-white py-3 rounded-lg hover:bg-indigo-700 transition font-medium"
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
            <Video className="w-6 h-6 text-indigo-400" />
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
                        Organisé par: {meet.organizerPseudo} • {meet.date} à {meet.time}
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
                      <span className="bg-indigo-100 text-indigo-800 text-xs px-2 py-1 rounded">Organisateur</span>
                    )}
                  </div>
                </div>
                <div className="space-y-2 mb-4 text-sm text-gray-600">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    <span>{meet.date} à {meet.time}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    <span>{meet.participants.length} participant(s)</span>
                  </div>
                  <a
                    href={generateGoogleCalendarUrl(meet)}
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
                      const pseudo = prompt('Entrez votre pseudo pour cette réunion:', currentUser.pseudo);
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
                  <label className="block text-sm font-medium text-gray-700 mb-2">Heure *</label>
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

      {sendingEmails && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
          <div className="bg-[#fff6ea] rounded-lg p-8 max-w-md text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-[#590293] mx-auto mb-4"></div>
            <h3 className="text-xl font-semibold text-gray-800 mb-2">Envoi des invitations</h3>
            <p className="text-gray-600">Veuillez patienter...</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default JitsiMeetPlatform;