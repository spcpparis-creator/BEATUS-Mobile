// Utilitaire pour générer des PDF de devis et factures dans l'app mobile
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';

interface TenantBranding {
  name?: string;
  pdfLogoUrl?: string;
  logoUrl?: string;
  companyName?: string;
  siret?: string;
  tvaNumber?: string;
  headquartersAddress?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  companyPhone?: string;
  companyEmail?: string;
  legalMentions?: string;
  paymentInstructions?: string;
  paymentTerms?: string;
  ribIban?: string;
  ribBic?: string;
  pdfPrimaryColor?: string;
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
  tvaRate?: number | string;
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
  const parts = [address.street, address.postalCode, address.city].filter(Boolean);
  return parts.join(', ') || '';
};

// Formater une date
const formatDate = (dateStr?: string): string => {
  if (!dateStr) return new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  const date = new Date(dateStr);
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
};

// Formater une date courte
const formatDateShort = (dateStr?: string): string => {
  if (!dateStr) return new Date().toLocaleDateString('fr-FR');
  return new Date(dateStr).toLocaleDateString('fr-FR');
};

// Formater un montant
const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(amount);
};

// Cache pour les logos en base64
const logoCache: Record<string, string> = {};

/**
 * Convertit une URL d'image en data URI base64
 * Nécessaire car expo-print ne peut pas charger les images distantes
 */
async function imageUrlToBase64(url: string): Promise<string> {
  if (!url) return '';
  
  // Vérifier le cache
  if (logoCache[url]) return logoCache[url];
  
  try {
    // Télécharger l'image dans un fichier temporaire
    const filename = `logo_${Date.now()}.png`;
    const fileUri = `${FileSystem.cacheDirectory}${filename}`;
    
    const downloadResult = await FileSystem.downloadAsync(url, fileUri);
    
    if (downloadResult.status !== 200) {
      console.warn(`[PDF] Logo download failed: HTTP ${downloadResult.status}`);
      return '';
    }
    
    // Lire le fichier en base64
    const base64 = await FileSystem.readAsStringAsync(fileUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    
    // Déterminer le type MIME
    const ext = url.split('.').pop()?.toLowerCase()?.split('?')[0] || 'png';
    const mimeTypes: Record<string, string> = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      svg: 'image/svg+xml',
      webp: 'image/webp',
    };
    const mime = mimeTypes[ext] || 'image/png';
    
    const dataUri = `data:${mime};base64,${base64}`;
    
    // Mettre en cache
    logoCache[url] = dataUri;
    
    // Nettoyer le fichier temporaire
    FileSystem.deleteAsync(fileUri, { idempotent: true }).catch(() => {});
    
    console.log(`[PDF] Logo converti en base64 (${Math.round(base64.length / 1024)} KB)`);
    return dataUri;
  } catch (error) {
    console.warn('[PDF] Erreur conversion logo en base64:', error);
    return '';
  }
}

/**
 * Génère le HTML pour un PDF de devis ou facture — Design professionnel
 */
export async function generatePDFHtml(
  document: QuoteOrInvoice,
  type: 'quote' | 'invoice',
  branding: TenantBranding = {},
  signatureBase64?: string
): Promise<string> {
  const isQuote = type === 'quote';
  const title = isQuote ? 'DEVIS' : 'FACTURE';
  const documentNumber = document.number || document.reference || 'N/A';
  const companyName = branding.companyName || branding.name || 'Mon Entreprise';
  const logoUrl = branding.pdfLogoUrl || branding.logoUrl || '';
  const companyAddress = branding.headquartersAddress 
    || [branding.address, branding.postalCode, branding.city].filter(Boolean).join(', ')
    || '';
  const companySiret = branding.siret || '';
  const companyTva = branding.tvaNumber || '';
  const companyPhone = branding.companyPhone || '';
  const companyEmail = branding.companyEmail || '';
  const primaryColor = branding.pdfPrimaryColor || '#1a56db';
  const clientAddress = formatClientAddress(document.clientAddress);

  // Convertir le logo en base64 pour l'embarquer dans le PDF
  const logoBase64 = await imageUrlToBase64(logoUrl);

  // Calculer les montants avec le vrai taux de TVA
  const amountTTC = toNumber(document.amountTTC);
  const materialCost = toNumber(document.materialCost);
  const totalAmount = amountTTC + materialCost;
  const tvaRate = toNumber(document.tvaRate) || 20;
  const providedHT = toNumber(document.amountHT);
  const totalHT = providedHT > 0 ? providedHT : totalAmount / (1 + tvaRate / 100);
  const tva = totalAmount - totalHT;

  // Générer les lignes du tableau
  let tableRows = '';
  if (document.items && Array.isArray(document.items) && document.items.length > 0) {
    document.items.forEach((item, idx) => {
      const description = item.description || 'Article';
      const quantity = toNumber(item.quantity) || 1;
      const unitPrice = toNumber(item.unitPrice);
      const total = toNumber(item.total) || (quantity * unitPrice);
      const qtyDisplay = Number.isInteger(quantity) ? String(quantity) : quantity.toFixed(2);
      const rowBg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
      tableRows += `
        <tr style="background: ${rowBg};">
          <td class="td-desc">${description}</td>
          <td class="td-center">${qtyDisplay}</td>
          <td class="td-right">${formatCurrency(unitPrice)}</td>
          <td class="td-right td-bold">${formatCurrency(total)}</td>
        </tr>
      `;
    });
  } else if (amountTTC > 0) {
    tableRows = `
      <tr>
        <td class="td-desc">Prestation de service</td>
        <td class="td-center">1</td>
        <td class="td-right">${formatCurrency(amountTTC)}</td>
        <td class="td-right td-bold">${formatCurrency(amountTTC)}</td>
      </tr>
    `;
  }

  // Statuts
  const statusLabels: Record<string, string> = isQuote
    ? { draft: 'Brouillon', sent: 'Envoyé', accepted: 'Accepté', rejected: 'Rejeté', converted: 'Converti en facture' }
    : { draft: 'Brouillon', sent: 'Envoyée', paid: 'Payée', cancelled: 'Annulée', overdue: 'En retard' };

  const statusColors: Record<string, string> = {
    draft: '#6b7280',
    sent: '#2563eb',
    accepted: '#059669',
    rejected: '#dc2626',
    converted: '#7c3aed',
    paid: '#059669',
    cancelled: '#dc2626',
    overdue: '#d97706',
  };

  const statusLabel = statusLabels[document.status] || document.status;
  const statusColor = statusColors[document.status] || '#6b7280';

  // Construire le bloc logo ou nom
  const logoHtml = logoBase64
    ? `<img src="${logoBase64}" style="max-width: 180px; max-height: 70px; object-fit: contain;" />`
    : `<div style="font-size: 26px; font-weight: 800; color: ${primaryColor}; letter-spacing: -0.5px;">${companyName}</div>`;

  // Informations de paiement (facture uniquement)
  let paymentHtml = '';
  if (!isQuote && (branding.paymentInstructions || branding.paymentTerms || branding.ribIban)) {
    paymentHtml = `
      <div class="payment-box">
        <div class="payment-title">Informations de paiement</div>
        ${branding.paymentInstructions || branding.paymentTerms
          ? `<p style="margin-bottom: 6px;">${branding.paymentInstructions || branding.paymentTerms}</p>` 
          : ''}
        ${branding.ribIban ? `
          <div style="display: flex; gap: 20px; margin-top: 8px;">
            <div><span class="label">IBAN :</span> ${branding.ribIban}</div>
            ${branding.ribBic ? `<div><span class="label">BIC :</span> ${branding.ribBic}</div>` : ''}
          </div>
        ` : ''}
      </div>
    `;
  }

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    @page { margin: 0; size: A4; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
      font-size: 11px;
      color: #1f2937;
      background: #fff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .page {
      position: relative;
      width: 100%;
      min-height: 100vh;
      padding: 0;
    }

    /* ── Bande supérieure colorée ── */
    .top-bar {
      height: 8px;
      background: linear-gradient(90deg, ${primaryColor}, ${primaryColor}cc);
    }

    /* ── Header ── */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding: 30px 40px 20px;
    }
    .header-left { max-width: 55%; }
    .header-right { text-align: right; }
    .doc-type {
      font-size: 32px;
      font-weight: 800;
      color: ${primaryColor};
      letter-spacing: 2px;
      line-height: 1;
    }
    .doc-number {
      font-size: 13px;
      color: #6b7280;
      margin-top: 6px;
    }
    .doc-date {
      font-size: 11px;
      color: #9ca3af;
      margin-top: 3px;
    }

    /* ── Status badge ── */
    .status-badge {
      display: inline-block;
      margin-top: 10px;
      padding: 4px 14px;
      border-radius: 20px;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #fff;
      background: ${statusColor};
    }

    /* ── Séparateur ── */
    .divider {
      height: 1px;
      background: #e5e7eb;
      margin: 0 40px;
    }

    /* ── Blocs émetteur / client ── */
    .parties {
      display: flex;
      gap: 30px;
      padding: 25px 40px;
    }
    .party-block {
      flex: 1;
      padding: 20px;
      border-radius: 8px;
    }
    .party-emitter {
      background: #f0f5ff;
      border: 1px solid ${primaryColor}22;
    }
    .party-client {
      background: #f9fafb;
      border: 1px solid #e5e7eb;
    }
    .party-label {
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      color: ${primaryColor};
      margin-bottom: 10px;
    }
    .party-client .party-label { color: #6b7280; }
    .party-name {
      font-size: 15px;
      font-weight: 700;
      color: #111827;
      margin-bottom: 8px;
    }
    .party-info {
      font-size: 10px;
      color: #4b5563;
      line-height: 1.7;
    }
    .party-info .label {
      color: #9ca3af;
      font-size: 9px;
    }

    /* ── Référence intervention ── */
    .ref-bar {
      margin: 0 40px 20px;
      padding: 10px 16px;
      background: ${primaryColor}0a;
      border-left: 3px solid ${primaryColor};
      border-radius: 0 6px 6px 0;
      font-size: 11px;
      color: #374151;
    }
    .ref-bar strong { color: ${primaryColor}; }

    /* ── Tableau ── */
    .table-wrap {
      padding: 0 40px;
      margin-bottom: 20px;
    }
    table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      border-radius: 8px;
      overflow: hidden;
      border: 1px solid #e5e7eb;
    }
    thead th {
      background: ${primaryColor};
      color: #fff;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      padding: 12px 16px;
      text-align: left;
    }
    thead th:nth-child(2) { text-align: center; }
    thead th:nth-child(3),
    thead th:nth-child(4) { text-align: right; }
    .td-desc { padding: 14px 16px; border-bottom: 1px solid #f3f4f6; }
    .td-center { padding: 14px 16px; text-align: center; border-bottom: 1px solid #f3f4f6; color: #6b7280; }
    .td-right { padding: 14px 16px; text-align: right; border-bottom: 1px solid #f3f4f6; }
    .td-bold { font-weight: 700; color: #111827; }

    /* ── Totaux ── */
    .totals-section {
      display: flex;
      justify-content: flex-end;
      padding: 0 40px;
      margin-bottom: 25px;
    }
    .totals-box {
      min-width: 260px;
      border-radius: 8px;
      overflow: hidden;
      border: 1px solid #e5e7eb;
    }
    .totals-row {
      display: flex;
      justify-content: space-between;
      padding: 10px 20px;
      font-size: 11px;
      background: #f9fafb;
      border-bottom: 1px solid #f3f4f6;
    }
    .totals-row .totals-label { color: #6b7280; }
    .totals-row .totals-value { font-weight: 600; color: #374151; }
    .totals-total {
      background: ${primaryColor} !important;
      border-bottom: none !important;
    }
    .totals-total .totals-label {
      color: #fff !important;
      font-size: 13px;
      font-weight: 700;
    }
    .totals-total .totals-value {
      color: #fff !important;
      font-size: 15px;
      font-weight: 800;
    }

    /* ── Notes ── */
    .notes-box {
      margin: 0 40px 15px;
      padding: 14px 18px;
      background: #fffbeb;
      border: 1px solid #fde68a;
      border-radius: 8px;
      font-size: 10px;
      color: #92400e;
      line-height: 1.6;
    }
    .notes-box strong { display: block; margin-bottom: 4px; font-size: 11px; }

    /* ── Paiement ── */
    .payment-box {
      margin: 0 40px 15px;
      padding: 16px 20px;
      background: #f0fdf4;
      border: 1px solid #bbf7d0;
      border-radius: 8px;
      font-size: 10px;
      color: #166534;
      line-height: 1.6;
    }
    .payment-title {
      font-size: 11px;
      font-weight: 700;
      margin-bottom: 6px;
      color: #15803d;
    }
    .payment-box .label { font-weight: 700; }

    /* ── Footer ── */
    .footer {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      padding: 15px 40px;
      border-top: 1px solid #e5e7eb;
      background: #f9fafb;
    }
    .footer-content {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .footer-left {
      font-size: 8px;
      color: #9ca3af;
      line-height: 1.6;
      max-width: 70%;
    }
    .footer-right {
      font-size: 8px;
      color: #9ca3af;
      text-align: right;
    }
    .footer-legal {
      font-style: italic;
    }
  </style>
</head>
<body>
  <div class="page">
    <!-- Bande colorée -->
    <div class="top-bar"></div>

    <!-- En-tête -->
    <div class="header">
      <div class="header-left">
        ${logoHtml}
      </div>
      <div class="header-right">
        <div class="doc-type">${title}</div>
        <div class="doc-number">N° ${documentNumber}</div>
        <div class="doc-date">${formatDate(document.createdAt)}</div>
        ${document.status !== 'draft' ? `<div class="status-badge">${statusLabel}</div>` : ''}
      </div>
    </div>

    <div class="divider"></div>

    <!-- Émetteur / Client -->
    <div class="parties">
      <div class="party-block party-emitter">
        <div class="party-label">Émetteur</div>
        <div class="party-name">${companyName}</div>
        <div class="party-info">
          ${companyAddress ? `${companyAddress}<br>` : ''}
          ${companySiret ? `<span class="label">SIRET</span> ${companySiret}<br>` : ''}
          ${companyTva ? `<span class="label">TVA</span> ${companyTva}<br>` : ''}
          ${companyPhone ? `<span class="label">Tél.</span> ${companyPhone}<br>` : ''}
          ${companyEmail ? `<span class="label">Email</span> ${companyEmail}` : ''}
        </div>
      </div>
      <div class="party-block party-client">
        <div class="party-label">Client</div>
        <div class="party-name">${document.clientName || 'Client'}</div>
        <div class="party-info">
          ${clientAddress ? `${clientAddress}<br>` : ''}
          ${document.clientPhone ? `<span class="label">Tél.</span> ${document.clientPhone}<br>` : ''}
          ${document.clientEmail ? `<span class="label">Email</span> ${document.clientEmail}` : ''}
        </div>
      </div>
    </div>

    <!-- Référence intervention -->
    ${document.interventionReference ? `
      <div class="ref-bar">
        <strong>Intervention :</strong> ${document.interventionReference}
        ${document.intervention?.type ? ` — ${document.intervention.type}` : ''}
      </div>
    ` : ''}

    ${document.intervention?.description ? `
      <div style="padding: 0 40px; margin-bottom: 15px;">
        <p style="font-size: 10px; color: #6b7280; line-height: 1.6;">${document.intervention.description}</p>
      </div>
    ` : ''}

    <!-- Tableau des prestations -->
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th style="width: 48%;">Désignation</th>
            <th style="width: 12%;">Qté</th>
            <th style="width: 20%;">Prix unitaire</th>
            <th style="width: 20%;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows || `
            <tr>
              <td colspan="4" style="padding: 30px; text-align: center; color: #9ca3af; font-style: italic;">
                Aucune prestation renseignée
              </td>
            </tr>
          `}
        </tbody>
      </table>
    </div>

    <!-- Totaux -->
    <div class="totals-section">
      <div class="totals-box">
        <div class="totals-row">
          <span class="totals-label">Total HT</span>
          <span class="totals-value">${formatCurrency(totalHT)}</span>
        </div>
        <div class="totals-row">
          <span class="totals-label">TVA (${tvaRate}%)</span>
          <span class="totals-value">${formatCurrency(tva)}</span>
        </div>
        <div class="totals-row totals-total">
          <span class="totals-label">TOTAL TTC</span>
          <span class="totals-value">${formatCurrency(totalAmount)}</span>
        </div>
      </div>
    </div>

    <!-- Mode de paiement (facture) -->
    ${!isQuote && document.paymentMethod ? `
      <div style="padding: 0 40px; margin-bottom: 10px;">
        <p style="font-size: 11px;"><strong>Mode de paiement :</strong> ${document.paymentMethod}</p>
      </div>
    ` : ''}

    <!-- Informations de paiement (facture) -->
    ${paymentHtml}

    <!-- Notes -->
    ${document.notes ? `
      <div class="notes-box">
        <strong>Notes</strong>
        ${document.notes}
      </div>
    ` : ''}

    <!-- Signature -->
    ${signatureBase64 ? `
      <div style="padding: 0 40px; margin-bottom: 60px;">
        <div style="display: flex; justify-content: flex-end;">
          <div style="text-align: center; min-width: 220px;">
            <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #6b7280; margin-bottom: 8px;">
              Signature ${type === 'quote' ? 'du technicien' : ''}
            </div>
            <div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 8px; background: #fafafa;">
              <img src="${signatureBase64}" style="max-width: 200px; max-height: 80px; object-fit: contain;" />
            </div>
            <div style="font-size: 9px; color: #9ca3af; margin-top: 6px;">${formatDateShort()}</div>
          </div>
        </div>
      </div>
    ` : ''}

    <!-- Pied de page -->
    <div class="footer">
      <div class="footer-content">
        <div class="footer-left">
          ${branding.legalMentions ? `<span class="footer-legal">${branding.legalMentions}</span><br>` : ''}
          ${companyName}${companySiret ? ` — SIRET ${companySiret}` : ''}${companyTva ? ` — TVA ${companyTva}` : ''}
        </div>
        <div class="footer-right">
          ${title} N° ${documentNumber}<br>
          ${formatDateShort(document.createdAt)}
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;

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
  const html = await generatePDFHtml(document, type, branding);
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
  const html = await generatePDFHtml(document, type, branding);

  try {
    await Print.printAsync({
      html,
    });
  } catch (error: any) {
    console.error('Erreur impression PDF:', error);
    throw new Error(`Erreur lors de l'impression: ${error.message}`);
  }
}
