// Utilitaire pour générer des PDF de devis et factures dans l'app mobile
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

interface TenantBranding {
  name?: string;
  pdfLogoUrl?: string;
  companyName?: string;
  siret?: string;
  headquartersAddress?: string;
  companyPhone?: string;
  companyEmail?: string;
  legalMentions?: string;
  paymentInstructions?: string;
}

interface QuoteOrInvoice {
  id: string;
  number?: string;
  reference?: string;
  status: string;
  clientName?: string;
  clientEmail?: string;
  clientPhone?: string;
  clientAddress?: string | { street?: string; city?: string; postalCode?: string };
  interventionReference?: string;
  intervention?: {
    type?: string;
    description?: string;
  };
  items?: Array<{
    description?: string;
    quantity?: number;
    unitPrice?: number;
    total?: number;
  }>;
  amountTTC?: number | string;
  amountHT?: number | string;
  tvaAmount?: number | string;
  materialCost?: number | string;
  notes?: string;
  createdAt?: string;
  paymentMethod?: string;
}

// Convertir une valeur en nombre
const toNumber = (value: any): number => {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  const parsed = parseFloat(String(value).replace(',', '.'));
  return isNaN(parsed) ? 0 : parsed;
};

// Convertir l'adresse client en string
const formatClientAddress = (address: any): string => {
  if (!address) return '';
  if (typeof address === 'string') return address;
  return address.street || [address.postalCode, address.city].filter(Boolean).join(' ') || '';
};

// Formater une date
const formatDate = (dateStr?: string): string => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
};

// Formater un montant
const formatCurrency = (amount: number): string => {
  return amount.toFixed(2).replace('.', ',') + ' €';
};

/**
 * Génère le HTML pour un PDF de devis ou facture
 */
export function generatePDFHtml(
  document: QuoteOrInvoice,
  type: 'quote' | 'invoice',
  branding: TenantBranding = {}
): string {
  const isQuote = type === 'quote';
  const title = isQuote ? 'DEVIS' : 'FACTURE';
  const documentNumber = document.number || document.reference || 'N/A';
  const companyName = branding.companyName || branding.name || 'BEATUS';
  const clientAddress = formatClientAddress(document.clientAddress);

  // Calculer les montants
  const amountTTC = toNumber(document.amountTTC);
  const materialCost = toNumber(document.materialCost);
  const totalAmount = amountTTC + materialCost;
  const totalHT = totalAmount / 1.2;
  const tva = totalAmount - totalHT;

  // Générer les lignes du tableau
  let tableRows = '';
  if (document.items && Array.isArray(document.items) && document.items.length > 0) {
    for (const item of document.items) {
      const description = item.description || 'Article';
      const quantity = toNumber(item.quantity) || 1;
      const unitPrice = toNumber(item.unitPrice);
      const total = toNumber(item.total) || (quantity * unitPrice);
      tableRows += `
        <tr>
          <td style="padding: 12px; border-bottom: 1px solid #e0e0e0;">${description}</td>
          <td style="padding: 12px; border-bottom: 1px solid #e0e0e0; text-align: center;">${quantity}</td>
          <td style="padding: 12px; border-bottom: 1px solid #e0e0e0; text-align: right;">${formatCurrency(unitPrice)}</td>
          <td style="padding: 12px; border-bottom: 1px solid #e0e0e0; text-align: right; font-weight: bold;">${formatCurrency(total)}</td>
        </tr>
      `;
    }
  } else if (amountTTC > 0) {
    tableRows = `
      <tr>
        <td style="padding: 12px; border-bottom: 1px solid #e0e0e0;">Prestation de service</td>
        <td style="padding: 12px; border-bottom: 1px solid #e0e0e0; text-align: center;">1</td>
        <td style="padding: 12px; border-bottom: 1px solid #e0e0e0; text-align: right;">${formatCurrency(amountTTC)}</td>
        <td style="padding: 12px; border-bottom: 1px solid #e0e0e0; text-align: right; font-weight: bold;">${formatCurrency(amountTTC)}</td>
      </tr>
    `;
  }

  // Statuts
  const statusLabels: Record<string, string> = isQuote
    ? { draft: 'Brouillon', sent: 'Envoyé', accepted: 'Accepté', rejected: 'Rejeté', converted: 'Converti' }
    : { draft: 'Brouillon', sent: 'Envoyée', paid: 'Payée', cancelled: 'Annulée' };

  const statusColors: Record<string, string> = {
    draft: '#95a5a6',
    sent: '#3498db',
    accepted: '#27ae60',
    rejected: '#e74c3c',
    converted: '#9b59b6',
    paid: '#27ae60',
    cancelled: '#e74c3c',
  };

  const statusLabel = statusLabels[document.status] || document.status;
  const statusColor = statusColors[document.status] || '#95a5a6';

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 12px; color: #2c3e50; padding: 20px; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 2px solid #e0e0e0; }
        .logo-section { }
        .logo { max-width: 120px; max-height: 50px; }
        .company-name { font-size: 24px; font-weight: bold; color: #2c3e50; }
        .document-type { text-align: right; }
        .document-type h1 { font-size: 28px; color: #2980b9; margin-bottom: 5px; }
        .document-type p { font-size: 11px; color: #7f8c8d; }
        .info-blocks { display: flex; gap: 20px; margin-bottom: 20px; }
        .info-block { flex: 1; background: #f8f9fa; padding: 15px; border-radius: 5px; }
        .info-block-title { font-size: 10px; font-weight: bold; color: #2980b9; margin-bottom: 8px; text-transform: uppercase; }
        .info-block-name { font-size: 14px; font-weight: bold; margin-bottom: 5px; }
        .info-block p { font-size: 10px; margin-bottom: 3px; color: #555; }
        .intervention-ref { background: #2980b9; color: white; padding: 10px 15px; border-radius: 5px; margin-bottom: 15px; }
        .intervention-ref span { font-weight: bold; }
        .intervention-details { margin-bottom: 15px; font-size: 11px; }
        .intervention-details strong { color: #2c3e50; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        thead { background: #2980b9; color: white; }
        th { padding: 12px; text-align: left; font-weight: bold; }
        th:nth-child(2), th:nth-child(3), th:nth-child(4) { text-align: center; }
        th:nth-child(3), th:nth-child(4) { text-align: right; }
        .totals { display: flex; justify-content: flex-end; margin-bottom: 20px; }
        .totals-box { background: #f8f9fa; padding: 15px; border-radius: 5px; min-width: 200px; }
        .totals-row { display: flex; justify-content: space-between; margin-bottom: 5px; font-size: 11px; }
        .totals-row.total { font-size: 14px; font-weight: bold; color: #2980b9; border-top: 1px solid #e0e0e0; padding-top: 8px; margin-top: 5px; }
        .status { display: inline-block; padding: 5px 12px; border-radius: 15px; font-size: 10px; font-weight: bold; color: white; background: ${statusColor}; }
        .notes { background: #fffbf0; padding: 15px; border-radius: 5px; margin-bottom: 15px; }
        .notes-title { font-weight: bold; margin-bottom: 5px; }
        .payment-instructions { background: #fff8dc; padding: 15px; border-radius: 5px; margin-bottom: 15px; border-left: 4px solid #f39c12; }
        .footer { text-align: center; margin-top: 30px; padding-top: 15px; border-top: 1px solid #e0e0e0; }
        .footer p { font-size: 8px; color: #95a5a6; margin-bottom: 3px; }
        .legal { font-style: italic; }
      </style>
    </head>
    <body>
      <!-- En-tête -->
      <div class="header">
        <div class="logo-section">
          ${branding.pdfLogoUrl 
            ? `<img src="${branding.pdfLogoUrl}" class="logo" alt="Logo" />`
            : `<div class="company-name">${companyName}</div>`
          }
        </div>
        <div class="document-type">
          <h1>${title}</h1>
          <p>N° ${documentNumber}</p>
          <p>Date: ${formatDate(document.createdAt)}</p>
        </div>
      </div>

      <!-- Blocs info -->
      <div class="info-blocks">
        <div class="info-block">
          <div class="info-block-title">Émetteur</div>
          <div class="info-block-name">${companyName}</div>
          ${branding.headquartersAddress ? `<p>${branding.headquartersAddress}</p>` : ''}
          ${branding.siret ? `<p>SIRET: ${branding.siret}</p>` : ''}
          ${branding.companyPhone ? `<p>Tél: ${branding.companyPhone}</p>` : ''}
          ${branding.companyEmail ? `<p>Email: ${branding.companyEmail}</p>` : ''}
        </div>
        <div class="info-block">
          <div class="info-block-title">Client</div>
          <div class="info-block-name">${document.clientName || 'Client'}</div>
          ${clientAddress ? `<p>${clientAddress}</p>` : ''}
          ${document.clientPhone ? `<p>Tél: ${document.clientPhone}</p>` : ''}
          ${document.clientEmail ? `<p>Email: ${document.clientEmail}</p>` : ''}
        </div>
      </div>

      <!-- Référence intervention -->
      <div class="intervention-ref">
        <span>Intervention:</span> ${document.interventionReference || 'N/A'}
      </div>

      ${document.intervention ? `
        <div class="intervention-details">
          ${document.intervention.type ? `<p><strong>Type:</strong> ${document.intervention.type}</p>` : ''}
          ${document.intervention.description ? `<p><strong>Description:</strong> ${document.intervention.description}</p>` : ''}
        </div>
      ` : ''}

      <!-- Tableau des prestations -->
      <table>
        <thead>
          <tr>
            <th style="width: 50%;">Désignation</th>
            <th style="width: 15%;">Qté</th>
            <th style="width: 17%;">Prix unitaire</th>
            <th style="width: 18%;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows || '<tr><td colspan="4" style="padding: 20px; text-align: center; color: #95a5a6;">Aucune prestation</td></tr>'}
        </tbody>
      </table>

      <!-- Totaux -->
      <div class="totals">
        <div class="totals-box">
          <div class="totals-row"><span>Total HT:</span><span>${formatCurrency(totalHT)}</span></div>
          <div class="totals-row"><span>TVA (20%):</span><span>${formatCurrency(tva)}</span></div>
          <div class="totals-row total"><span>TOTAL TTC:</span><span>${formatCurrency(totalAmount)}</span></div>
        </div>
      </div>

      <!-- Statut -->
      <p style="margin-bottom: 15px;">Statut: <span class="status">${statusLabel}</span></p>

      ${!isQuote && document.paymentMethod ? `
        <p style="margin-bottom: 15px;"><strong>Mode de paiement:</strong> ${document.paymentMethod}</p>
      ` : ''}

      ${!isQuote && branding.paymentInstructions ? `
        <div class="payment-instructions">
          <div class="notes-title">Instructions de paiement:</div>
          <p>${branding.paymentInstructions}</p>
        </div>
      ` : ''}

      ${document.notes ? `
        <div class="notes">
          <div class="notes-title">Notes:</div>
          <p>${document.notes}</p>
        </div>
      ` : ''}

      <!-- Pied de page -->
      <div class="footer">
        ${branding.legalMentions ? `<p class="legal">${branding.legalMentions}</p>` : ''}
        <p>Document généré automatiquement par ${companyName}</p>
      </div>
    </body>
    </html>
  `;

  return html;
}

/**
 * Génère et affiche/partage un PDF
 */
export async function generateAndSharePDF(
  document: QuoteOrInvoice,
  type: 'quote' | 'invoice',
  branding: TenantBranding = {}
): Promise<void> {
  const html = generatePDFHtml(document, type, branding);
  const documentNumber = document.number || document.reference || 'document';
  const prefix = type === 'quote' ? 'devis' : 'facture';
  const filename = `${prefix}-${documentNumber.replace(/\//g, '-')}.pdf`;

  try {
    // Générer le PDF
    const { uri } = await Print.printToFileAsync({
      html,
      base64: false,
    });

    // Vérifier si le partage est disponible
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: `Partager ${type === 'quote' ? 'le devis' : 'la facture'}`,
        UTI: 'com.adobe.pdf',
      });
    } else {
      throw new Error('Le partage n\'est pas disponible sur cet appareil');
    }
  } catch (error: any) {
    console.error('Erreur génération PDF:', error);
    throw new Error(`Erreur lors de la génération du PDF: ${error.message}`);
  }
}

/**
 * Affiche un aperçu du PDF (impression)
 */
export async function printPDF(
  document: QuoteOrInvoice,
  type: 'quote' | 'invoice',
  branding: TenantBranding = {}
): Promise<void> {
  const html = generatePDFHtml(document, type, branding);

  try {
    await Print.printAsync({
      html,
    });
  } catch (error: any) {
    console.error('Erreur impression PDF:', error);
    throw new Error(`Erreur lors de l'impression: ${error.message}`);
  }
}
