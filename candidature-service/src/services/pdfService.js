const PDFDocument = require('pdfkit');

function genererPdfCV(cv) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 50
    });

    const morceaux = [];

    // Collecter les données du PDF.
    doc.on('data', (morceau) => {
      morceaux.push(morceau);
    });

    // Retourner le fichier complet.
    doc.on('end', () => {
      resolve(Buffer.concat(morceaux));
    });

    doc.on('error', reject);

    function ajouterRubrique(titre) {
      doc.moveDown();
      doc.font('Helvetica-Bold').fontSize(14).text(titre);
      doc.moveDown(0.5);
      doc.font('Helvetica').fontSize(11);
    }

    function formaterDate(date) {
      return new Date(date).toLocaleDateString('fr-FR', {
        timeZone: 'UTC'
      });
    }

    doc.font('Helvetica-Bold')
      .fontSize(22)
      .text(cv.titre, { align: 'center' });

    ajouterRubrique('Compétences');

    doc.text(
      cv.competences?.length
        ? cv.competences.join(', ')
        : 'Non renseignées'
    );

    ajouterRubrique('Langues');

    doc.text(
      cv.langues?.length
        ? cv.langues.join(', ')
        : 'Non renseignées'
    );

    ajouterRubrique('Formations');

    if (cv.formations?.length) {
      for (const formation of cv.formations) {
        doc.text(
          `${formation.diplome} — ${formation.etablissement}`
        );

        if (formation.annee) {
          doc.text(`Année : ${formation.annee}`);
        }

        doc.moveDown(0.5);
      }
    } else {
      doc.text('Aucune formation renseignée');
    }

    ajouterRubrique('Expériences');

    if (cv.experiences?.length) {
      for (const experience of cv.experiences) {
        doc.text(
          `${experience.poste} — ${experience.entreprise}`
        );

        const debut = formaterDate(experience.dateDebut);

        const fin = experience.dateFin
          ? formaterDate(experience.dateFin)
          : 'En cours';

        doc.text(`${debut} — ${fin}`);

        if (experience.description) {
          doc.text(experience.description);
        }

        doc.moveDown(0.5);
      }
    } else {
      doc.text('Aucune expérience renseignée');
    }

    if (cv.lienLinkedin) {
      ajouterRubrique('LinkedIn');
      doc.text(cv.lienLinkedin);
    }

    doc.end();
  });
}

module.exports = { genererPdfCV };