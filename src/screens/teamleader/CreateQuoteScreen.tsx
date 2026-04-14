import React, { useState, useEffect, useCallback, useRef } from 'react';
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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import SignatureScreen from 'react-native-signature-canvas';
import { COLORS, API_BASE_URL } from '../../config/api';
import * as SecureStore from 'expo-secure-store';
import * as Print from 'expo-print';
import * as FileSystem from 'expo-file-system/legacy';
import { generateAndSharePDF, generatePDFHtml } from '../../utils/pdfGenerator';
import api from '../../services/api';

interface Props {
  navigation: any;
  route?: { params?: { interventionId?: string; intervention?: any; quoteId?: string } };
}

interface LineItem {
  id: string;
  description: string;
  quantity: string;
  unitPrice: string;
}

const PAYMENT_OPTIONS = [
  { value: 50, label: 'Acompte 50%', key: 'deposit' },
  { value: 100, label: 'Totalité 100%', key: 'full' },
];

const TVA_OPTIONS = [
  { value: 0, label: '0%' },
  { value: 5.5, label: '5,5%' },
  { value: 10, label: '10%' },
  { value: 20, label: '20%' },
];

export default function CreateQuoteScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const interventionId = route?.params?.interventionId;
  const intervention = route?.params?.intervention;
  const existingQuoteId = route?.params?.quoteId;
  
  const [saving, setSaving] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [loading, setLoading] = useState(!!existingQuoteId);
  
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
  
  // TVA
  const [tvaRate, setTvaRate] = useState(20);
  const [showTvaPicker, setShowTvaPicker] = useState(false);
  
  // Options
  const [notes, setNotes] = useState('');

  // Branding du TL
  const billingSettingsRef = useRef<any>(null);
  const [brandingChecked, setBrandingChecked] = useState(false);
  const isSendingRef = useRef(false);

  // Flux en 3 étapes : Générer → Signer → Envoyer
  const [savedQuoteData, setSavedQuoteData] = useState<any>(null);
  const [paymentLink, setPaymentLink] = useState<string | null>(null);
  const [pdfBase64, setPdfBase64] = useState<string | null>(null);
  const [signatureBase64, setSignatureBase64] = useState<string | null>(null);
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const [stepLoading, setStepLoading] = useState<string | null>(null);
  const signatureRef = useRef<any>(null);
  const [paymentType, setPaymentType] = useState<'deposit' | 'full'>('deposit');
  const depositPercent = paymentType === 'full' ? 100 : 50;

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
          const tpl = Array.isArray(templates) ? templates.find((t: any) => t.template_type === 'quote' || t.templateType === 'quote') : null;
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

  // Charger le devis existant si modification
  useEffect(() => {
    if (existingQuoteId) {
      loadExistingQuote();
    } else if (intervention) {
      prefillFromIntervention();
    }
  }, [existingQuoteId, intervention]);

  const loadExistingQuote = async () => {
    try {
      const quote = await api.getQuote(existingQuoteId!);
      setClientName(quote.clientName || '');
      setClientEmail(quote.clientEmail || '');
      setClientPhone(quote.clientPhone || '');
      setClientAddress(
        typeof quote.clientAddress === 'string' 
          ? quote.clientAddress 
          : quote.clientAddress?.street || ''
      );
      setTvaRate(quote.tvaRate || quote.tva_rate || 20);
      setNotes(quote.notes || '');
      if (quote.items && Array.isArray(quote.items)) {
        setItems(quote.items.map((item: any, idx: number) => ({
          id: String(idx),
          description: item.description || '',
          quantity: String(item.quantity || 1),
          unitPrice: String(item.unitPrice || 0),
        })));
      }
    } catch (error: any) {
      Alert.alert('Erreur', 'Impossible de charger le devis');
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
    if (intervention?.estimatedAmount) {
      setAmountTTC(String(intervention.estimatedAmount));
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

  const calculateTvaAmount = () => {
    return calculateItemsTotal() * tvaRate / 100;
  };

  const calculateTotal = () => {
    return calculateItemsTotal() + calculateTvaAmount();
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount);
  };

  const buildQuoteData = () => {
    const totalHT = calculateItemsTotal();
    const tvaAmount = calculateTvaAmount();
    const totalTTC = calculateTotal();
    const validItems = items.filter(item => 
      item.description.trim() && parseFloat(item.unitPrice) > 0
    );

    return {
      interventionId: interventionId || undefined,
      clientName,
      clientEmail,
      clientPhone,
      clientAddress: clientAddress ? { street: clientAddress } : undefined,
      items: validItems.length > 0 ? validItems.map(item => ({
        description: item.description,
        quantity: parseFloat(item.quantity) || 1,
        unitPrice: parseFloat(item.unitPrice) || 0,
      })) : undefined,
      amountHT: totalHT,
      amountHt: totalHT,
      tvaRate,
      tvaAmount,
      amountTTC: totalTTC,
      amountTtc: totalTTC,
      depositPercentage: depositPercent,
      deposit_percentage: depositPercent,
      status: 'draft',
      notes,
    };
  };

  // ──── ÉTAPE 1 : Générer le devis ────
  const handleGenerate = async () => {
    if (stepLoading) return;
    if (!clientName.trim()) {
      Alert.alert('Erreur', 'Le nom du client est obligatoire');
      return;
    }
    if (!clientEmail.trim()) {
      Alert.alert('Erreur', 'L\'email du client est obligatoire pour envoyer le devis');
      return;
    }
    const total = calculateTotal();
    if (total <= 0) {
      Alert.alert('Erreur', 'Le montant doit être supérieur à 0');
      return;
    }

    setStepLoading('generate');
    try {
      // Charger le branding
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

      // 1. Sauvegarder le devis
      const token = await SecureStore.getItemAsync('authToken');
      const quoteData = buildQuoteData();
      const quoteId = savedQuoteData?.id || existingQuoteId;
      const url = quoteId
        ? `${API_BASE_URL}/quotes/${quoteId}`
        : `${API_BASE_URL}/quotes`;

      const response = await fetch(url, {
        method: quoteId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(quoteData),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || 'Erreur lors de la création');
      }
      const savedQuote = await response.json();
      const quoteRef = savedQuote.reference || savedQuote.number || '';
      setSavedQuoteData(savedQuote);

      // 2. Créer le lien de paiement (SumUp puis Stripe en fallback)
      const depositAmount = total * (depositPercent / 100);
      let link: string | null = null;

      if (depositAmount > 0) {
        try {
          const sumupRes = await api.createSumUpCheckout({
            amount: parseFloat(depositAmount.toFixed(2)),
            description: `Acompte ${depositPercent}% — Devis ${quoteRef} — ${clientName}`,
            purpose: 'deposit',
            referenceId: savedQuote.id,
            referenceType: 'quote',
          });
          link = sumupRes.checkoutUrl;
        } catch (_) {
          try {
            const stripeRes = await api.createStripeCheckout({
              amount: parseFloat(depositAmount.toFixed(2)),
              quoteId: savedQuote.id,
              quoteReference: quoteRef,
              clientName,
              description: `Acompte ${depositPercent}% — Devis ${quoteRef} — ${clientName}`,
            });
            link = stripeRes.checkoutUrl;
          } catch (_e2) {
            console.warn('Aucun lien de paiement disponible');
          }
        }
      }
      setPaymentLink(link);

      // 3. Générer le PDF
      const pdfData = {
        ...savedQuote,
        number: quoteRef,
        amountHT: calculateItemsTotal(),
        tvaRate,
        tvaAmount: calculateTvaAmount(),
        amountTTC: total,
        clientAddress,
        interventionReference: intervention?.reference || savedQuote.interventionReference || quoteRef,
        items: items.length > 0 ? items.map(item => ({
          description: item.description,
          quantity: parseFloat(item.quantity) || 1,
          unitPrice: parseFloat(item.unitPrice) || 0,
        })) : undefined,
      };
      const html = await generatePDFHtml(pdfData, 'quote', branding);
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      setPdfBase64(base64);
      setSignatureBase64(null);

      Alert.alert('Devis généré', `Devis ${quoteRef} créé avec succès.${link ? '\nLien de paiement inclus.' : ''}\n\nVous pouvez l\'envoyer directement ou le signer avant.`);
    } catch (error: any) {
      Alert.alert('Erreur', error.message || 'Impossible de générer le devis');
    } finally {
      setStepLoading(null);
    }
  };

  // ──── ÉTAPE 2 : Signer ────
  const handleOpenSignature = () => {
    if (!pdfBase64) {
      Alert.alert('Erreur', 'Veuillez d\'abord générer le devis');
      return;
    }
    setShowSignaturePad(true);
  };

  const handleSignatureCapture = async (sigBase64: string) => {
    setShowSignaturePad(false);
    setStepLoading('sign');
    try {
      setSignatureBase64(sigBase64);

      // Re-générer le PDF avec la signature intégrée
      let branding = billingSettingsRef.current || {};
      const quoteRef = savedQuoteData?.reference || savedQuoteData?.number || '';
      const total = calculateTotal();
      const pdfData = {
        ...savedQuoteData,
        number: quoteRef,
        amountHT: calculateItemsTotal(),
        tvaRate,
        tvaAmount: calculateTvaAmount(),
        amountTTC: total,
        clientAddress,
        interventionReference: intervention?.reference || savedQuoteData?.interventionReference || quoteRef,
        items: items.length > 0 ? items.map(item => ({
          description: item.description,
          quantity: parseFloat(item.quantity) || 1,
          unitPrice: parseFloat(item.unitPrice) || 0,
        })) : undefined,
      };
      const html = await generatePDFHtml(pdfData, 'quote', branding, sigBase64);
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      setPdfBase64(base64);

      Alert.alert('Signature ajoutée', 'Le devis est signé. Vous pouvez maintenant l\'envoyer.');
    } catch (error: any) {
      Alert.alert('Erreur', 'Impossible d\'intégrer la signature');
    } finally {
      setStepLoading(null);
    }
  };

  // ──── ÉTAPE 3 : Envoyer ────
  const handleSendEmail = async () => {
    if (isSendingRef.current || !pdfBase64 || !savedQuoteData) return;

    isSendingRef.current = true;
    setStepLoading('send');
    try {
      const quoteRef = savedQuoteData.reference || savedQuoteData.number || '';
      const total = calculateTotal();
      const depositAmount = total * (depositPercent / 100);

      // Récupérer la signature email du tenant
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

      const isFullPayment = paymentType === 'full';
      const paymentLabel = isFullPayment ? 'la totalité' : `l'acompte de ${depositPercent} %`;
      const paymentSection = paymentLink
        ? `Vous pouvez effectuer le règlement de ${paymentLabel} directement via le lien de paiement sécurisé ci-dessous :\n\n👉 ${paymentLink}`
        : 'Le lien de paiement sera communiqué séparément.';

      const amountLabel = isFullPayment
        ? `le montant total de ${formatCurrency(depositAmount)}`
        : `un acompte de ${depositPercent} %, soit un montant de ${formatCurrency(depositAmount)}`;
      const message = `Bonjour ${clientName},\n\nVeuillez trouver en pièce jointe le devis relatif à l'intervention référencée "${quoteRef}".\n\nConformément à nos échanges, ${amountLabel} est demandé afin de valider et planifier l'intervention.\n\n${paymentSection}\n\nDès réception du paiement, l'intervention sera confirmée.\n\nNous restons bien entendu à votre disposition pour toute question ou information complémentaire.\n\nCordialement,${tenantSignature}`;
      const subject = isFullPayment
        ? `Envoi de devis et lien de paiement – Totalité`
        : `Envoi de devis et lien de paiement – Acompte ${depositPercent} %`;

      await api.sendQuoteWithPdf({
        to: clientEmail.trim(),
        subject,
        message,
        pdfBase64: `data:application/pdf;base64,${pdfBase64}`,
        quoteId: savedQuoteData.id,
      });

      Alert.alert(
        'Devis envoyé !',
        `Le devis${signatureBase64 ? ' signé' : ''} a été envoyé par email à ${clientEmail}.${paymentLink ? '\nLe lien de paiement sécurisé est inclus.' : ''}`,
        [
          { text: 'Voir le devis', onPress: () => navigation.replace('QuoteDetail', { quoteId: savedQuoteData?.id }) },
          { text: 'Mes documents', onPress: () => navigation.navigate('MyDocuments') },
        ]
      );
    } catch (error: any) {
      Alert.alert('Erreur', error.message || 'Impossible d\'envoyer le devis');
    } finally {
      setStepLoading(null);
      isSendingRef.current = false;
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
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
            {existingQuoteId ? 'Modifier le devis' : 'Créer un devis'}
          </Text>
          {intervention && (
            <Text style={styles.subtitle}>
              Intervention {intervention.reference || interventionId?.substring(0, 8)}
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
                Ajoutez des articles avec le bouton ci-dessus
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

        {/* TVA */}
        <View style={styles.section}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Taux de TVA</Text>
            <TouchableOpacity 
              style={styles.selectInput}
              onPress={() => setShowTvaPicker(true)}
            >
              <Text style={styles.selectInputText}>
                {TVA_OPTIONS.find(t => t.value === tvaRate)?.label || '20%'}
              </Text>
              <Text style={styles.selectArrow}>▼</Text>
            </TouchableOpacity>
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

        {/* Récapitulatif HT / TVA / TTC / Acompte */}
        {calculateItemsTotal() > 0 && (
          <View style={styles.totalBanner}>
            <View style={styles.totalBannerRow}>
              <Text style={styles.depositBannerLabel}>Total HT</Text>
              <Text style={styles.depositBannerValue}>{formatCurrency(calculateItemsTotal())}</Text>
            </View>
            <View style={styles.totalBannerRow}>
              <Text style={styles.depositBannerLabel}>TVA ({TVA_OPTIONS.find(t => t.value === tvaRate)?.label})</Text>
              <Text style={styles.depositBannerValue}>{formatCurrency(calculateTvaAmount())}</Text>
            </View>
            <View style={styles.totalBannerDivider} />
            <View style={styles.totalBannerRow}>
              <Text style={styles.totalBannerLabel}>Total TTC</Text>
              <Text style={styles.totalBannerValue}>{formatCurrency(total)}</Text>
            </View>
            <View style={styles.totalBannerDivider} />
            {/* Choix type de paiement */}
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
              {PAYMENT_OPTIONS.map(opt => (
                <TouchableOpacity
                  key={opt.key}
                  onPress={() => setPaymentType(opt.key as 'deposit' | 'full')}
                  style={{
                    flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center',
                    backgroundColor: paymentType === opt.key ? '#2563eb' : '#e5e7eb',
                  }}
                >
                  <Text style={{ color: paymentType === opt.key ? '#fff' : '#374151', fontWeight: '700', fontSize: 13 }}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.totalBannerRow}>
              <Text style={styles.depositBannerLabel}>{paymentType === 'full' ? 'Totalité' : `Acompte (${depositPercent}%)`}</Text>
              <Text style={styles.depositBannerValue}>
                {formatCurrency(total * depositPercent / 100)}
              </Text>
            </View>
            {paymentType === 'deposit' && (
              <View style={styles.totalBannerRow}>
                <Text style={styles.depositBannerLabel}>Solde restant ({100 - depositPercent}%)</Text>
                <Text style={styles.depositBannerValue}>
                  {formatCurrency(total * (100 - depositPercent) / 100)}
                </Text>
              </View>
            )}
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
            <Text style={[styles.stepCircleText, !pdfBase64 && styles.stepCircleTextInactive]}>{signatureBase64 ? '✓' : '✍️'}</Text>
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
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        {/* Bouton 1 : Générer */}
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
              <Text style={styles.btnText}>{pdfBase64 ? 'Regénérer le devis' : '1. Générer le devis'}</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Bouton 2 : Signer (optionnel) */}
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

        {/* Bouton 3 : Envoyer */}
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
                <Text style={styles.label}>Prix unitaire HT (€)</Text>
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
            <Text style={styles.signatureTitle}>Signer le devis</Text>
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

      {/* Modal sélection TVA */}
      <Modal
        visible={showTvaPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowTvaPicker(false)}
      >
        <TouchableOpacity 
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowTvaPicker(false)}
        >
          <View style={styles.pickerContent}>
            {TVA_OPTIONS.map(option => (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.pickerOption,
                  tvaRate === option.value && styles.pickerOptionSelected
                ]}
                onPress={() => {
                  setTvaRate(option.value);
                  setShowTvaPicker(false);
                }}
              >
                <Text style={[
                  styles.pickerOptionText,
                  tvaRate === option.value && styles.pickerOptionTextSelected
                ]}>
                  TVA {option.label}
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
    paddingBottom: 16,
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
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
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
    color: COLORS.primary,
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
    backgroundColor: '#dbeafe',
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
    color: '#1e40af',
  },
  totalBannerValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1e40af',
  },
  totalBannerDivider: {
    height: 1,
    backgroundColor: '#93c5fd',
    marginVertical: 10,
  },
  depositBannerLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#2563eb',
  },
  depositBannerValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2563eb',
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
  stepActive: {
    backgroundColor: '#2563eb',
  },
  stepDone: {
    backgroundColor: '#22c55e',
  },
  stepInactive: {
    backgroundColor: '#e2e8f0',
  },
  stepCircleText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
  stepCircleTextInactive: {
    color: '#94a3b8',
  },
  stepLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#374151',
    marginTop: 3,
  },
  stepLabelInactive: {
    color: '#94a3b8',
  },
  stepLine: {
    flex: 1,
    height: 2,
    backgroundColor: '#e2e8f0',
    marginHorizontal: 6,
    marginBottom: 16,
  },
  stepLineDone: {
    backgroundColor: '#22c55e',
  },
  footer: {
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
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
  buttonDisabled: {
    backgroundColor: '#e2e8f0',
  },
  buttonDone: {
    backgroundColor: '#16a34a',
  },
  btnIcon: {
    fontSize: 16,
  },
  btnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  signatureHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  signatureCancel: {
    fontSize: 16,
    color: '#ef4444',
    fontWeight: '600',
  },
  signatureTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
  },
  signatureHint: {
    textAlign: 'center',
    fontSize: 14,
    color: '#64748b',
    paddingVertical: 10,
  },
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
    backgroundColor: '#2563eb',
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
    backgroundColor: '#dbeafe',
  },
  pickerOptionText: {
    fontSize: 16,
    color: COLORS.text,
  },
  pickerOptionTextSelected: {
    color: '#1e40af',
    fontWeight: '600',
  },
});
