const nodemailer = require('nodemailer');

async function envoyerConfirmationCandidature(email, titreOffre) {
  if (!process.env.MAIL_USER || !process.env.MAIL_PASS) {
    throw new Error('Configuration email manquante');
  }

  const transporteur = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.MAIL_USER,
      pass: process.env.MAIL_PASS
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000
  });

  const resultat = await transporteur.sendMail({
    from: {
      name: 'GreenJob',
      address: process.env.MAIL_USER
    },
    to: email,
    subject: 'Confirmation de votre candidature — GreenJob',
    text: [
      'Bonjour,',
      '',
      `Votre candidature pour l’offre « ${titreOffre} » a bien été enregistrée.`,
      'Vous pouvez suivre son statut sur GreenJob.',
      '',
      'L’équipe GreenJob'
    ].join('\n')
  });

  if (!resultat.accepted || resultat.accepted.length === 0) {
    throw new Error('Email non accepté par le serveur de messagerie');
  }

  return resultat;
}

module.exports = { envoyerConfirmationCandidature };