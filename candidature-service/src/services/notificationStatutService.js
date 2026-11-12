const nodemailer = require('nodemailer');

async function notifierStatut(email, titre, statut) {
  if (!email) {
    return {
      emailEnvoye: false,
      message: 'Ancienne candidature sans adresse de notification enregistrée'
    };
  }

  try {
    if (!process.env.MAIL_USER || !process.env.MAIL_PASS) {
      throw new Error('Configuration email absente');
    }

    const transport = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000
    });

    const info = await transport.sendMail({
      from: {
        name: 'GreenJob',
        address: process.env.MAIL_USER
      },
      to: email,
      subject: 'Mise à jour de votre candidature',
      text: [
        'Bonjour,',
        '',
        `Votre candidature pour « ${titre || 'l’offre'} » est maintenant au statut : ${statut}.`,
        '',
        'L’équipe GreenJob'
      ].join('\n')
    });

    if (!info.accepted?.length) {
      throw new Error('Destinataire non accepté');
    }

    return {
      emailEnvoye: true,
      message: 'Notification acceptée par le serveur de messagerie'
    };
  } catch {
    console.error('Échec email de changement de statut');

    return {
      emailEnvoye: false,
      message: 'Statut enregistré, mais la notification email a échoué'
    };
  }
}

module.exports = { notifierStatut };