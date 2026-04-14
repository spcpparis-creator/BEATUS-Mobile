import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import SignatureScreen from 'react-native-signature-canvas';
import { COLORS, API_BASE_URL } from '../../config/api';
import * as SecureStore from 'expo-secure-store';
import * as Print from 'expo-print';
import * as FileSystem from 'expo-file-system/legacy';
import { generateAndSharePDF, generatePDFHtml } from '../../utils/pdfGenerator';
import api from '../../services/api';

interface Props {
  navigation: any;
  route?: { params?: { interventionId?: string; intervention?: any; quoteId?: string; invoiceId?: string } };
}

interface LineItem {
  id: string;
  description: string;
  quantity: string;
  unitPrice: string;
}

const DEFAULT_DEPOSIT_PERCENTAGE = 50;

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Brouillon' },
  { value: 'sent', label: 'Envoyée' },
  { value: 'paid', label: 'Payée' },
  { value: 'cancelled', label: 'Annulée' },
];

export default function CreateInvoiceScreen({ navigation, route }: Props) {
  const interventionId = route?.params?.interventionId;
  const intervention = route?.params?.intervention;
  const quoteId = route?.params?.quoteId;
  const existingInvoiceId = route?.params?.invoiceId;
  
  const [saving, setSaving] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [loading, setLoading] = useState(!!existingInvoiceId);
  
  // Informations client
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientAddress, setClientAddress] = useState('');
  
  // Articles
  const [items, setItems] = useState<LineItem[]>([]);
  const [showAddItem, setShowAddItem] = useState(false);
  const [newItemDescription, setNewItemDescription] = useState('');
  const [newItemQuantity, setNewItemQuantity] = useState('1');
  const [newItemPrice, setNewItemPrice] = useState('');
  
  // Montants
  const [amountTTC, setAmountTTC] = useState('');
  const [materialCost, setMaterialCost] = useState('');
  
  // Options
  const [status, setStatus] = useState('draft');
  const [notes, setNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [tvaRate, setTvaRate] = useState(20);

  // Devis lié (pour acompte)
  const [linkedQuote, setLinkedQuote] = useState<any>(null);
  const quoteDepositPercent = linkedQuote?.depositPercentage || linkedQuote?.deposit_percentage || DEFAULT_DEPOSIT_PERCENTAGE;

  // Branding du TL
  const billingSettingsRef = useRef<any>(null);
  const isSendingRef = useRef(false);
  const [brandingChecked, setBrandingChecked] = useState(false);

  // Flux en 3 étapes : Générer → Signer → Envoyer
  const [savedInvoiceData, setSavedInvoiceData] = useState<any>(null);
  const [paymentLink, setPaymentLink] = useState<string | null>(null);
  const [pdfBase64, setPdfBase64] = useState<string | null>(null);
  const [signatureBase64, setSignatureBase64] = useState<string | null>(null);
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const [stepLoading, setStepLoading] = useState<string | null>(null);
  const signatureRef = useRef<any>(null);

  // Vérifier le branding au montage et à chaque retour sur l'écran
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      checkBillingSettings();
    });
    return unsubscribe;
  }, [navigation]);

  const checkBillingSettings = async () => {
    try {
      let hasCompanyName = false;

      // Source 1 : billing-settings/me (retourne automatiquement les settings admin si pas self-billing)
      try {
        const billingData = await api.getBillingSettings();
        const settings = billingData?.settings;
        if (settings?.companyName) {
          billingSettingsRef.current = settings;
          hasCompanyName = true;
        }
      } catch (_) { /* ignore */ }

      // Source 2 : user-templates (DocumentSettings) - seulement si pas encore trouvé
      if (!hasCompanyName) {
        try {
          const templates = await api.getUserTemplates();
          const tpl = Array.isArray(templates) ? templates.find((t: any) => t.template_type === 'invoice' || t.templateType === 'invoice') : null;
          const vars = tpl?.variables || tpl?.metadata || {};
          if (vars.company_name || vars.companyName) {
            billingSettingsRef.current = {
              companyName: vars.company_name || vars.companyName,
              siret: vars.siret || '',
              address: vars.address || '',
              logoUrl: vars.logo_url || vars.logoUrl || '',
            };
            hasCompanyName = true;
          }
        } catch (_) { /* ignore */ }
      }

      if (hasCompanyName) {
        setBrandingChecked(true);
      } else {
        const state = navigation.getState();
        const hasDocSettings = state?.routes?.some((r: any) => r.name === 'DocumentSettings') ||
          state?.routeNames?.includes('DocumentSettings');
        if (hasDocSettings) {
          navigation.navigate('DocumentSettings');
        } else {
          setBrandingChecked(true);
        }
      }
    } catch (e: any) {
      setBrandingChecked(true);
    }
  };

  // Charger le devis lié pour connaître l'acompte
  useEffect(() => {
    if (quoteId) {
      loadLinkedQuote();
    }
  }, [quoteId]);

  const loadLinkedQuote = async () => {
    try {
      const quote = await api.getQuote(quoteId!);
      setLinkedQuote(quote);

      // Pré-remplir le formulaire avec les données du devis
      if (quote.clientName) setClientName(quote.clientName);
      if (quote.clientEmail) setClientEmail(quote.clientEmail);
      if (quote.clientPhone) setClientPhone(quote.clientPhone);
      if (quote.clientAddress) {
        setClientAddress(
          typeof quote.clientAddress === 'string'
            ? quote.clientAddress
            : quote.clientAddress?.street || ''
        );
      }
      if (quote.notes) setNotes(quote.notes);

      // Pré-remplir les articles
      const quoteItems = quote.items || [];
      if (Array.isArray(quoteItems) && quoteItems.length > 0) {
        setItems(quoteItems.map((item: any, idx: number) => ({
          id: `q-${idx}-${Date.now()}`,
          description: item.description || '',
          quantity: String(item.quantity || 1),
          unitPrice: String(item.unitPrice || item.unit_price || 0),
        })));
      }

      // Pré-remplir le montant TTC et TVA
      const ttc = quote.amountTtc || quote.amountTTC || quote.amount_ttc;
      if (ttc) setAmountTTC(String(ttc));
      if (quote.materialCost) setMaterialCost(String(quote.materialCost));
      if (quote.tvaRate != null) setTvaRate(quote.tvaRate);
    } catch (error) {
      console.log('Impossible de charger le devis lié:', error);
    }
  };

  // Charger la facture existante si modification
  useEffect(() => {
    if (existingInvoiceId) {
      loadExistingInvoice();
    } else if (intervention) {
      prefillFromIntervention();
    }
  }, [existingInvoiceId, intervention]);

  const loadExistingInvoice = async () => {
    try {
      const invoice = await api.getInvoice(existingInvoiceId!);
      setClientName(invoice.clientName || '');
      setClientEmail(invoice.clientEmail || '');
      setClientPhone(invoice.clientPhone || '');
      setClientAddress(
        typeof invoice.clientAddress === 'string' 
          ? invoice.clientAddress 
          : invoice.clientAddress?.street || ''
      );
      setAmountTTC(String(invoice.amountTtc || invoice.amountTTC || ''));
      setMaterialCost(String(invoice.materialCost || ''));
      setStatus(invoice.status || 'draft');
      setNotes(invoice.notes || '');
      setPaymentMethod(invoice.paymentMethod || '');
      if (invoice.items && Array.isArray(invoice.items)) {
        setItems(invoice.items.map((item: any, idx: number) => ({
          id: String(idx),
          description: item.description || '',
          quantity: String(item.quantity || 1),
          unitPrice: String(item.unitPrice || 0),
        })));
      }
    } catch (error: any) {
      Alert.alert('Erreur', 'Impossible de charger la facture');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  };

  const prefillFromIntervention = () => {
    if (intervention?.client) {
      setClientName(intervention.client.name || '');
      setClientEmail(intervention.client.email || '');
      setClientPhone(intervention.client.phone || '');
      if (intervention.client.address) {
        const addr = intervention.client.address;
        setClientAddress(`${addr.street || ''}, ${addr.postalCode || ''} ${addr.city || ''}`.trim());
      }
    }
    if (intervention?.address && !clientAddress) {
      const addr = intervention.address;
      setClientAddress(`${addr.street || ''}, ${addr.postalCode || ''} ${addr.city || ''}`.trim());
    }
    const amount = intervention?.amountRealized || intervention?.amountTTC || intervention?.estimatedAmount;
    if (amount) {
      setAmountTTC(String(amount));
    }
  };

  const addItem = () => {
    if (!newItemDescription.trim() || !newItemPrice) {
      Alert.alert('Erreur', 'Veuillez remplir la description et le prix');
      return;
    }
    setItems([
      ...items,
      {
        id: Date.now().toString(),
        description: newItemDescription,
        quantity: newItemQuantity || '1',
        unitPrice: newItemPrice,
      }
    ]);
    setNewItemDescription('');
    setNewItemQuantity('1');
    setNewItemPrice('');
    setShowAddItem(false);
  };

  const removeItem = (id: string) => {
    setItems(items.filter(item => item.id !== id));
  };

  const calculateItemsTotal = () => {
    return items.reduce((sum, item) => {
      const qty = parseFloat(item.quantity) || 0;
      const price = parseFloat(item.unitPrice) || 0;
      return sum + (qty * price);
    }, 0);
  };

  const calculateTotal = () => {
    const itemsTotal = calculateItemsTotal();
    const ttc = parseFloat(amountTTC) || 0;
    const material = parseFloat(materialCost) || 0;
    return itemsTotal > 0 ? itemsTotal : ttc + material;
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount);
  };

  const buildInvoiceData = () => {
    const total = calculateTotal();
    const validItems = items.filter(item => 
      item.description.trim() && parseFloat(item.unitPrice) > 0
    );

    return {
      interventionId: interventionId || undefined,
      quoteId: quoteId || undefined,
      clientName,
      clientEmail,
      clientPhone,
      clientAddress: clientAddress ? { street: clientAddress } : undefined,
      items: validItems.length > 0 ? validItems.map(item => ({
        description: item.description,
        quantity: parseFloat(item.quantity) || 1,
        unitPrice: parseFloat(item.unitPrice) || 0,
      })) : undefined,
      amountTTC: total,
      amountTtc: total,
      tvaRate,
      materialCost: parseFloat(materialCost) || undefined,
      status,
      notes,
      paymentMethod: paymentMethod || undefined,
    };
  };

  // ──── ÉTAPE 1 : Générer la facture ────
  const handleGenerate = async () => {
    if (stepLoading) return;
    if (!clientName.trim()) {
      Alert.alert('Erreur', 'Le nom du client est obligatoire');
      return;
    }
    if (!clientEmail.trim()) {
      Alert.alert('Erreur', 'L\'email du client est obligatoire pour envoyer la facture');
      return;
    }
    const total = calculateTotal();
    if (total <= 0) {
      Alert.alert('Erreur', 'Le montant doit être supérieur à 0');
      return;
    }

    setStepLoading('generate');
    try {
      let branding = billingSettingsRef.current || {};
      if (!branding.companyName) {
        try {
          const tenant = await api.getTenantSettings();
          if (tenant) {
            branding = {
              companyName: tenant.companyName || tenant.company_name || '',
              siret: tenant.siret || '',
              headquartersAddress: tenant.headquartersAddress || tenant.headquarters_address || '',
              companyPhone: tenant.companyPhone || tenant.company_phone || '',
              companyEmail: tenant.companyEmail || tenant.company_email || '',
              legalMentions: tenant.legalMentions || tenant.legal_mentions || '',
              paymentInstructions: tenant.paymentInstructions || tenant.payment_instructions || '',
              pdfLogoUrl: tenant.pdfLogoUrl || tenant.pdf_logo_url || '',
              ...branding,
            };
            billingSettingsRef.current = branding;
          }
        } catch (_) { /* ignore */ }
      }

      // 1. Sauvegarder la facture
      const token = await SecureStore.getItemAsync('authToken');
      const invoiceData = buildInvoiceData();
      const invoiceId = savedInvoiceData?.id || existingInvoiceId;
      const url = invoiceId
        ? `${API_BASE_URL}/invoices/${invoiceId}`
        : `${API_BASE_URL}/invoices`;

      const response = await fetch(url, {
        method: invoiceId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(invoiceData),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || 'Erreur lors de la création');
      }
      const savedInvoice = await response.json();
      const invoiceRef = savedInvoice.reference || savedInvoice.number || '';
      setSavedInvoiceData(savedInvoice);

      // 2. Calculer le solde restant et créer le lien de paiement
      let depositPaid = 0;
      if (linkedQuote) {
        depositPaid = linkedQuote.depositAmount || parseFloat((total * quoteDepositPercent / 100).toFixed(2));
        if (linkedQuote.depositPaid === false) depositPaid = 0;
      }
      const balanceAmount = parseFloat((total - depositPaid).toFixed(2));
      const paymentTotal = balanceAmount > 0 ? balanceAmount : total;

      let link: string | null = null;
      if (paymentTotal > 0) {
        const desc = linkedQuote
          ? `Solde facture ${invoiceRef} — ${clientName}`
          : `Facture ${invoiceRef} — ${clientName}`;
        try {
          const sumupRes = await api.createSumUpCheckout({
            amount: parseFloat(paymentTotal.toFixed(2)),
            description: desc,
            purpose: 'balance',
            referenceId: savedInvoice.id,
            referenceType: 'invoice',
          });
          link = sumupRes.checkoutUrl;
        } catch (_) {
          try {
            const stripeRes = await api.createStripeCheckout({
              amount: parseFloat(paymentTotal.toFixed(2)),
              quoteId: savedInvoice.id,
              quoteReference: invoiceRef,
              clientName,
              description: desc,
            });
            link = stripeRes.checkoutUrl;
          } catch (_e2) {
            console.warn('Aucun lien de paiement disponible');
          }
        }
      }
      setPaymentLink(link);

      // 3. Générer le PDF avec détail acompte/solde
      const pdfData = {
        ...savedInvoice,
        number: invoiceRef,
        amountTTC: total,
        clientAddress,
        interventionReference: intervention?.reference || savedInvoice.interventionReference || invoiceRef,
        paymentMethod,
        tvaRate,
        depositAmount: depositPaid > 0 ? depositPaid : undefined,
        balanceAmount: depositPaid > 0 ? balanceAmount : undefined,
        sumupCheckoutUrl: link || undefined,
        items: items.length > 0 ? items.map(item => ({
          description: item.description,
          quantity: parseFloat(item.quantity) || 1,
          unitPrice: parseFloat(item.unitPrice) || 0,
        })) : undefined,
      };
      const html = await generatePDFHtml(pdfData, 'invoice', branding);
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      setPdfBase64(base64);
      setSignatureBase64(null);

      const balanceMsg = linkedQuote && depositPaid > 0
        ? `\nAcompte : ${formatCurrency(depositPaid)}\nSolde restant : ${formatCurrency(balanceAmount)}`
        : '';
      Alert.alert('Facture générée', `Facture ${invoiceRef} créée.${balanceMsg}${link ? '\nLien de paiement inclus.' : ''}\n\nVous pouvez l\'envoyer directement ou la signer avant.`);
    } catch (error: any) {
      Alert.alert('Erreur', error.message || 'Impossible de générer la facture');
    } finally {
      setStepLoading(null);
    }
  };

  // ──── ÉTAPE 2 : Signer ────
  const handleOpenSignature = () => {
    if (!pdfBase64) {
      Alert.alert('Erreur', 'Veuillez d\'abord générer la facture');
      return;
    }
    setShowSignaturePad(true);
  };

  const handleSignatureCapture = async (sigBase64: string) => {
    setShowSignaturePad(false);
    setStepLoading('sign');
    try {
      setSignatureBase64(sigBase64);

      let branding = billingSettingsRef.current || {};
      const invoiceRef = savedInvoiceData?.reference || savedInvoiceData?.number || '';
      const total = calculateTotal();
      const pdfData = {
        ...savedInvoiceData,
        number: invoiceRef,
        amountTTC: total,
        clientAddress,
        interventionReference: intervention?.reference || savedInvoiceData?.interventionReference || invoiceRef,
        paymentMethod,
        items: items.length > 0 ? items.map(item => ({
          description: item.description,
          quantity: parseFloat(item.quantity) || 1,
          unitPrice: parseFloat(item.unitPrice) || 0,
        })) : undefined,
      };
      const html = await generatePDFHtml(pdfData, 'invoice', branding, sigBase64);
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      setPdfBase64(base64);

      Alert.alert('Signature ajoutée', 'La facture est signée. Vous pouvez maintenant l\'envoyer.');
    } catch (error: any) {
      Alert.alert('Erreur', 'Impossible d\'intégrer la signature');
    } finally {
      setStepLoading(null);
    }
  };

  // ──── ÉTAPE 3 : Envoyer ────
  const handleSendEmail = async () => {
    if (isSendingRef.current || !pdfBase64 || !savedInvoiceData) return;

    isSendingRef.current = true;
    setStepLoading('send');
    try {
      const invoiceRef = savedInvoiceData.reference || savedInvoiceData.number || '';
      const total = calculateTotal();

      // Calculer acompte et solde
      let depositPaid = 0;
      if (linkedQuote) {
        depositPaid = linkedQuote.depositAmount || parseFloat((total * quoteDepositPercent / 100).toFixed(2));
        if (linkedQuote.depositPaid === false) depositPaid = 0;
      }
      const balanceAmount = parseFloat((total - depositPaid).toFixed(2));

      let tenantSignature = '';
      try {
        const tenant = await api.getTenantSettings();
        const sig = tenant?.emailSignature || tenant?.email_signature;
        if (sig) {
          tenantSignature = `\n\n${sig}`;
        } else {
          const companyN = tenant?.companyName || tenant?.company_name || '';
          const companyP = tenant?.companyPhone || tenant?.company_phone || '';
          const companyE = tenant?.companyEmail || tenant?.company_email || '';
          if (companyN || companyP || companyE) {
            tenantSignature = `\n\n${companyN}${companyP ? `\n📞 ${companyP}` : ''}${companyE ? `\n✉️ ${companyE}` : ''}`;
          }
        }
      } catch (_) { /* ignore */ }

      let amountSection = '';
      if (linkedQuote && depositPaid > 0) {
        const isFullQuote = quoteDepositPercent >= 100;
        amountSection = isFullQuote
          ? `Montant total TTC : ${formatCurrency(total)}\nDéjà réglé intégralement sur devis.`
          : `Montant total TTC : ${formatCurrency(total)}\nAcompte déjà versé (${quoteDepositPercent}%) : ${formatCurrency(depositPaid)}\nSolde restant dû : ${formatCurrency(balanceAmount)}`;
      } else {
        amountSection = `Montant total TTC : ${formatCurrency(total)}`;
      }

      const paymentSection = paymentLink
        ? `Vous pouvez effectuer le règlement${linkedQuote && depositPaid > 0 ? ' du solde' : ''} directement via le lien de paiement sécurisé ci-dessous :\n\n👉 ${paymentLink}`
        : '';

      const message = `Bonjour ${clientName},\n\nVeuillez trouver en pièce jointe la facture n° "${invoiceRef}".\n\n${amountSection}${paymentSection ? `\n\n${paymentSection}` : ''}\n\nNous restons à votre disposition pour toute question.\n\nCordialement,${tenantSignature}`;
      const subject = linkedQuote && depositPaid > 0
        ? `Facture ${invoiceRef} — Solde ${formatCurrency(balanceAmount)}`
        : `Facture ${invoiceRef} — ${formatCurrency(total)}`;

      await api.sendQuoteWithPdf({
        to: clientEmail.trim(),
        subject,
        message,
        pdfBase64: `data:application/pdf;base64,${pdfBase64}`,
        quoteId: savedInvoiceData.id,
      });

      Alert.alert(
        'Facture envoyée !',
        `La facture${signatureBase64 ? ' signée' : ''} a été envoyée par email à ${clientEmail}.${paymentLink ? '\nLe lien de paiement est inclus.' : ''}`,
        [
          { text: 'Voir la facture', onPress: () => navigation.replace('InvoiceDetail', { invoiceId: savedInvoiceData?.id }) },
          { text: 'Mes documents', onPress: () => navigation.navigate('MyDocuments') },
        ]
      );
    } catch (error: any) {
      Alert.alert('Erreur', error.message || 'Impossible d\'envoyer la facture');
    } finally {
      setStepLoading(null);
      isSendingRef.current = false;
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#22c55e" />
          <Text style={styles.loadingText}>Chargement...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const total = calculateTotal();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeButton}>
          <Text style={styles.closeButtonText}>✕</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.title}>
            {existingInvoiceId ? 'Modifier la facture' : quoteId ? 'Convertir en facture' : 'Créer une facture'}
          </Text>
          {intervention && (
            <Text style={styles.subtitle}>
              Intervention {intervention.reference || interventionId?.substring(0, 8)}
            </Text>
          )}
          {linkedQuote?.reference && (
            <Text style={[styles.subtitle, { color: '#2563eb' }]}>
              Devis {linkedQuote.reference}
            </Text>
          )}
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Informations client */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Informations client</Text>
          
          <View style={styles.row}>
            <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
              <Text style={styles.label}>Nom</Text>
              <TextInput
                style={styles.input}
                value={clientName}
                onChangeText={setClientName}
                placeholder="Nom du client"
              />
            </View>
            <View style={[styles.inputGroup, { flex: 1, marginLeft: 8 }]}>
              <Text style={styles.label}>Téléphone</Text>
              <TextInput
                style={styles.input}
                value={clientPhone}
                onChangeText={setClientPhone}
                placeholder="0612345678"
                keyboardType="phone-pad"
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              value={clientEmail}
              onChangeText={setClientEmail}
              placeholder="client@email.com"
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Adresse</Text>
            <TextInput
              style={styles.input}
              value={clientAddress}
              onChangeText={setClientAddress}
              placeholder="Adresse complète"
            />
          </View>
        </View>

        {/* Articles */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Articles</Text>
            <TouchableOpacity 
              style={styles.addManualButton}
              onPress={() => setShowAddItem(true)}
            >
              <Text style={styles.addManualButtonText}>+ Ajouter manuellement</Text>
            </TouchableOpacity>
          </View>

          {/* Liste des articles */}
          {items.map((item, index) => (
            <View key={item.id} style={styles.itemCard}>
              <View style={styles.itemContent}>
                <Text style={styles.itemDescription}>{item.description}</Text>
                <Text style={styles.itemDetails}>
                  {item.quantity} x {formatCurrency(parseFloat(item.unitPrice) || 0)}
                </Text>
              </View>
              <View style={styles.itemActions}>
                <Text style={styles.itemTotal}>
                  {formatCurrency((parseFloat(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0))}
                </Text>
                <TouchableOpacity onPress={() => removeItem(item.id)}>
                  <Text style={styles.removeItemButton}>✕</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}

          {items.length === 0 && (
            <View style={styles.emptyItems}>
              <Text style={styles.emptyItemsText}>Aucun article ajouté</Text>
              <Text style={styles.emptyItemsHint}>
                Utilisez le bouton ci-dessus ou remplissez le montant TTC
              </Text>
            </View>
          )}

          {/* Recherche article (placeholder) */}
          <View style={styles.searchContainer}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Rechercher un article existant..."
              editable={false}
            />
          </View>
        </View>

        {/* Montants */}
        <View style={styles.section}>
          <View style={styles.row}>
            <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
              <Text style={styles.label}>Montant TTC (€)</Text>
              <TextInput
                style={styles.input}
                value={amountTTC}
                onChangeText={setAmountTTC}
                placeholder="0.00"
                keyboardType="decimal-pad"
                editable={items.length === 0}
              />
            </View>
            <View style={[styles.inputGroup, { flex: 1, marginLeft: 8 }]}>
              <Text style={styles.label}>Coût matériel (€)</Text>
              <TextInput
                style={styles.input}
                value={materialCost}
                onChangeText={setMaterialCost}
                placeholder="0.00"
                keyboardType="decimal-pad"
              />
            </View>
          </View>
        </View>

        {/* Statut et Mode de paiement */}
        <View style={styles.section}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Statut</Text>
            <TouchableOpacity 
              style={styles.selectInput}
              onPress={() => setShowStatusPicker(true)}
            >
              <Text style={styles.selectInputText}>
                {STATUS_OPTIONS.find(s => s.value === status)?.label || 'Brouillon'}
              </Text>
              <Text style={styles.selectArrow}>▼</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Mode de paiement</Text>
            <TextInput
              style={styles.input}
              value={paymentMethod}
              onChangeText={setPaymentMethod}
              placeholder="Ex: Carte bancaire, Espèces, Virement..."
            />
          </View>
        </View>

        {/* Notes */}
        <View style={styles.section}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Notes</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Notes optionnelles..."
              multiline
              numberOfLines={4}
            />
          </View>
        </View>

        {/* Total affiché avec détail acompte / solde */}
        {total > 0 && (
          <View style={styles.totalBanner}>
            <View style={styles.totalBannerRow}>
              <Text style={styles.totalBannerLabel}>Total TTC</Text>
              <Text style={styles.totalBannerValue}>{formatCurrency(total)}</Text>
            </View>
            <View style={styles.totalBannerDivider} />
            {(quoteId || linkedQuote) ? (
              <>
                {quoteDepositPercent < 100 && (
                  <View style={styles.totalBannerRow}>
                    <Text style={styles.depositBannerLabel}>Acompte déjà versé ({quoteDepositPercent}%)</Text>
                    <Text style={[styles.depositBannerValue, { color: '#059669' }]}>
                      - {formatCurrency(linkedQuote?.depositAmount || total * quoteDepositPercent / 100)}
                    </Text>
                  </View>
                )}
                <View style={[styles.totalBannerRow, { marginTop: 4 }]}>
                  <Text style={[styles.depositBannerLabel, { fontWeight: '700' }]}>
                    {quoteDepositPercent >= 100 ? 'Déjà réglé intégralement' : 'Solde à payer'}
                  </Text>
                  <Text style={[styles.depositBannerValue, { fontWeight: '700', fontSize: 18 }]}>
                    {quoteDepositPercent >= 100
                      ? formatCurrency(0)
                      : formatCurrency(total - (linkedQuote?.depositAmount || total * quoteDepositPercent / 100))}
                  </Text>
                </View>
                {linkedQuote?.reference && (
                  <View style={styles.linkedQuoteInfo}>
                    <Text style={styles.linkedQuoteText}>
                      Devis lié : {linkedQuote.reference}
                    </Text>
                  </View>
                )}
              </>
            ) : null}
          </View>
        )}
      </ScrollView>

      {/* Indicateur d'étapes */}
      <View style={styles.stepsIndicator}>
        <View style={styles.stepDot}>
          <View style={[styles.stepCircle, pdfBase64 ? styles.stepDone : styles.stepActive]}>
            <Text style={styles.stepCircleText}>{pdfBase64 ? '✓' : '1'}</Text>
          </View>
          <Text style={styles.stepLabel}>Générer</Text>
        </View>
        <View style={[styles.stepLine, pdfBase64 ? styles.stepLineDone : null]} />
        <View style={styles.stepDot}>
          <View style={[styles.stepCircle, signatureBase64 ? styles.stepDone : (pdfBase64 ? styles.stepActive : styles.stepInactive)]}>
            <Text style={[styles.stepCircleText, !pdfBase64 && styles.stepCircleTextInactive]}>{signatureBase64 ? '✓' : '2'}</Text>
          </View>
          <Text style={[styles.stepLabel, !pdfBase64 && styles.stepLabelInactive]}>Signer (opt.)</Text>
        </View>
        <View style={[styles.stepLine, pdfBase64 ? styles.stepLineDone : null]} />
        <View style={styles.stepDot}>
          <View style={[styles.stepCircle, pdfBase64 ? styles.stepActive : styles.stepInactive]}>
            <Text style={[styles.stepCircleText, !pdfBase64 && styles.stepCircleTextInactive]}>3</Text>
          </View>
          <Text style={[styles.stepLabel, !pdfBase64 && styles.stepLabelInactive]}>Envoyer</Text>
        </View>
      </View>

      {/* Boutons d'action */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.generateButton, pdfBase64 && styles.buttonDone]}
          onPress={handleGenerate}
          disabled={!!stepLoading}
        >
          {stepLoading === 'generate' ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Text style={styles.btnIcon}>{pdfBase64 ? '✓' : '📄'}</Text>
              <Text style={styles.btnText}>{pdfBase64 ? 'Regénérer la facture' : '1. Générer la facture'}</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.signButton, !pdfBase64 && styles.buttonDisabled, signatureBase64 && styles.buttonDone]}
          onPress={handleOpenSignature}
          disabled={!pdfBase64 || !!stepLoading}
        >
          {stepLoading === 'sign' ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Text style={styles.btnIcon}>{signatureBase64 ? '✓' : '✍️'}</Text>
              <Text style={styles.btnText}>{signatureBase64 ? '2. Signé' : '2. Signer (optionnel)'}</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.sendButton, !pdfBase64 && styles.buttonDisabled]}
          onPress={handleSendEmail}
          disabled={!pdfBase64 || !!stepLoading}
        >
          {stepLoading === 'send' ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Text style={styles.btnIcon}>📧</Text>
              <Text style={styles.btnText}>3. Envoyer par email</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.cancelButtonText}>Annuler</Text>
        </TouchableOpacity>
      </View>

      {/* Modal signature */}
      <Modal
        visible={showSignaturePad}
        transparent={false}
        animationType="slide"
        onRequestClose={() => setShowSignaturePad(false)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
          <View style={styles.signatureHeader}>
            <TouchableOpacity onPress={() => setShowSignaturePad(false)}>
              <Text style={styles.signatureCancel}>Annuler</Text>
            </TouchableOpacity>
            <Text style={styles.signatureTitle}>Signer la facture</Text>
            <View style={{ width: 60 }} />
          </View>
          <Text style={styles.signatureHint}>Signez avec votre doigt dans la zone ci-dessous</Text>
          <View style={{ flex: 1, margin: 16, borderRadius: 12, overflow: 'hidden', borderWidth: 2, borderColor: '#e2e8f0' }}>
            <SignatureScreen
              ref={signatureRef}
              onOK={(sig: string) => handleSignatureCapture(sig)}
              onEmpty={() => Alert.alert('Signature vide', 'Veuillez signer avant de valider.')}
              descriptionText=""
              clearText="Effacer"
              confirmText="Valider"
              webStyle={`
                .m-signature-pad { box-shadow: none; border: none; margin: 0; }
                .m-signature-pad--body { border: none; }
                .m-signature-pad--body canvas { background-color: #fafafa; }
                .m-signature-pad--footer { background-color: #fff; padding: 8px 16px; }
                .m-signature-pad--footer .button { background-color: #2563eb; color: #fff; border-radius: 10px; font-size: 16px; font-weight: 700; padding: 12px 24px; }
                .m-signature-pad--footer .button.clear { background-color: #f1f5f9; color: #64748b; }
                body,html { width: 100%; height: 100%; margin: 0; padding: 0; }
              `}
              autoClear={false}
              imageType="image/png"
              backgroundColor="rgba(250,250,250,1)"
              penColor="#1e293b"
              dotSize={2}
              minWidth={2}
              maxWidth={3}
            />
          </View>
        </SafeAreaView>
      </Modal>

      {/* Modal ajout article */}
      <Modal
        visible={showAddItem}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAddItem(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Ajouter un article</Text>
              <TouchableOpacity onPress={() => setShowAddItem(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Description</Text>
              <TextInput
                style={styles.input}
                value={newItemDescription}
                onChangeText={setNewItemDescription}
                placeholder="Description de l'article"
              />
            </View>

            <View style={styles.row}>
              <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
                <Text style={styles.label}>Quantité</Text>
                <TextInput
                  style={styles.input}
                  value={newItemQuantity}
                  onChangeText={setNewItemQuantity}
                  placeholder="1"
                  keyboardType="numeric"
                />
              </View>
              <View style={[styles.inputGroup, { flex: 1, marginLeft: 8 }]}>
                <Text style={styles.label}>Prix unitaire (€)</Text>
                <TextInput
                  style={styles.input}
                  value={newItemPrice}
                  onChangeText={setNewItemPrice}
                  placeholder="0.00"
                  keyboardType="decimal-pad"
                />
              </View>
            </View>

            <TouchableOpacity style={styles.modalAddButton} onPress={addItem}>
              <Text style={styles.modalAddButtonText}>Ajouter</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal sélection statut */}
      <Modal
        visible={showStatusPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowStatusPicker(false)}
      >
        <TouchableOpacity 
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowStatusPicker(false)}
        >
          <View style={styles.pickerContent}>
            {STATUS_OPTIONS.map(option => (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.pickerOption,
                  status === option.value && styles.pickerOptionSelected
                ]}
                onPress={() => {
                  setStatus(option.value);
                  setShowStatusPicker(false);
                }}
              >
                <Text style={[
                  styles.pickerOptionText,
                  status === option.value && styles.pickerOptionTextSelected
                ]}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: COLORS.textMuted,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  closeButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 24,
    color: '#64748b',
  },
  headerCenter: {
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
  },
  subtitle: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 16,
  },
  addManualButton: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  addManualButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.text,
  },
  inputGroup: {
    marginBottom: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: COLORS.text,
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
  },
  selectInput: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  selectInputText: {
    fontSize: 15,
    color: COLORS.text,
  },
  selectArrow: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  itemCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f0fdf4',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  itemContent: {
    flex: 1,
  },
  itemDescription: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.text,
  },
  itemDetails: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  itemActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  itemTotal: {
    fontSize: 14,
    fontWeight: '600',
    color: '#16a34a',
  },
  removeItemButton: {
    fontSize: 18,
    color: '#ef4444',
    padding: 4,
  },
  emptyItems: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  emptyItemsText: {
    fontSize: 14,
    color: COLORS.textMuted,
  },
  emptyItemsHint: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 4,
    textAlign: 'center',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 12,
    marginTop: 8,
  },
  searchIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 14,
    color: COLORS.textMuted,
  },
  totalBanner: {
    backgroundColor: '#dcfce7',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  totalBannerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 2,
  },
  totalBannerLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#166534',
  },
  totalBannerValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#166534',
  },
  totalBannerDivider: {
    height: 1,
    backgroundColor: '#86efac',
    marginVertical: 10,
  },
  depositBannerLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#15803d',
  },
  depositBannerValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#15803d',
  },
  linkedQuoteInfo: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#86efac',
  },
  linkedQuoteText: {
    fontSize: 12,
    color: '#166534',
    fontStyle: 'italic',
  },
  stepsIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 30,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  stepDot: {
    alignItems: 'center',
  },
  stepCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepActive: { backgroundColor: '#2563eb' },
  stepDone: { backgroundColor: '#22c55e' },
  stepInactive: { backgroundColor: '#e2e8f0' },
  stepCircleText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  stepCircleTextInactive: { color: '#94a3b8' },
  stepLabel: { fontSize: 10, fontWeight: '600', color: '#374151', marginTop: 3 },
  stepLabelInactive: { color: '#94a3b8' },
  stepLine: { flex: 1, height: 2, backgroundColor: '#e2e8f0', marginHorizontal: 6, marginBottom: 16 },
  stepLineDone: { backgroundColor: '#22c55e' },
  footer: {
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 32,
    backgroundColor: '#fff',
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#94a3b8',
    textAlign: 'center',
    paddingVertical: 4,
  },
  generateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#2563eb',
    gap: 8,
  },
  signButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#f59e0b',
    gap: 8,
  },
  sendButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#22c55e',
    gap: 8,
  },
  buttonDisabled: { backgroundColor: '#e2e8f0' },
  buttonDone: { backgroundColor: '#16a34a' },
  btnIcon: { fontSize: 16 },
  btnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  signatureHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  signatureCancel: { fontSize: 16, color: '#ef4444', fontWeight: '600' },
  signatureTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  signatureHint: { textAlign: 'center', fontSize: 14, color: '#64748b', paddingVertical: 10 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 400,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
  },
  modalClose: {
    fontSize: 24,
    color: '#64748b',
  },
  modalAddButton: {
    backgroundColor: '#22c55e',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  modalAddButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  pickerContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 8,
    width: '80%',
    maxWidth: 300,
  },
  pickerOption: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  pickerOptionSelected: {
    backgroundColor: '#dcfce7',
  },
  pickerOptionText: {
    fontSize: 16,
    color: COLORS.text,
  },
  pickerOptionTextSelected: {
    color: '#166534',
    fontWeight: '600',
  },
});
