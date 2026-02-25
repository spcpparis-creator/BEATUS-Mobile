import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Switch,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import api from '../../services/api';
import { COLORS } from '../../config/api';

interface Props {
  navigation: any;
}

export default function BillingSettingsScreen({ navigation }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [canCustomize, setCanCustomize] = useState(false);
  const [billingType, setBillingType] = useState<'platform' | 'self'>('platform');
  
  // Company info
  const [companyName, setCompanyName] = useState('');
  const [siret, setSiret] = useState('');
  const [tvaNumber, setTvaNumber] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [postalCode, setPostalCode] = useState('');
  
  // Banking info
  const [ribIban, setRibIban] = useState('');
  const [ribBic, setRibBic] = useState('');
  const [bankName, setBankName] = useState('');
  
  // Appearance
  const [logoUrl, setLogoUrl] = useState('');
  const [pdfPrimaryColor, setPdfPrimaryColor] = useState('#2563eb');
  
  // Email templates
  const [emailQuoteSubject, setEmailQuoteSubject] = useState('Votre devis #{reference}');
  const [emailQuoteBody, setEmailQuoteBody] = useState('Bonjour {client_name},\n\nVeuillez trouver ci-joint votre devis.\n\nCordialement,\n{company_name}');
  const [emailInvoiceSubject, setEmailInvoiceSubject] = useState('Votre facture #{reference}');
  const [emailInvoiceBody, setEmailInvoiceBody] = useState('Bonjour {client_name},\n\nVeuillez trouver ci-joint votre facture.\n\nCordialement,\n{company_name}');
  
  // Payment terms
  const [paymentTerms, setPaymentTerms] = useState('Paiement à réception de facture');
  const [paymentDelayDays, setPaymentDelayDays] = useState('30');
  const [legalMentions, setLegalMentions] = useState('');

  const [isTechUnderTL, setIsTechUnderTL] = useState(false);

  useEffect(() => {
    checkAccessAndLoadSettings();
  }, []);

  const checkAccessAndLoadSettings = async () => {
    // Un tech sous un TL ne doit PAS voir cette page
    // Il facture avec la société de son TL
    try {
      const me = await api.getMe();
      const role = me?.role || '';
      if (role === 'technician') {
        let tlId = me?.teamLeaderId || me?.team_leader_id || '';
        if (!tlId) {
          try {
            const techProfile = await api.getTechnicianProfile();
            tlId = techProfile?.teamLeaderId || techProfile?.team_leader_id || '';
          } catch (_) { /* ignore */ }
        }
        if (tlId) {
          // Tech sous un TL → pas accès à cette page
          setIsTechUnderTL(true);
          setLoading(false);
          return;
        }
      }
    } catch (_) { /* ignore */ }
    
    await loadSettings();
  };

  const loadSettings = async () => {
    try {
      const response = await api.getBillingSettings();
      setCanCustomize(response.canCustomize);
      
      if (response.settings) {
        const s = response.settings;
        setCompanyName(s.companyName || '');
        setSiret(s.siret || '');
        setTvaNumber(s.tvaNumber || '');
        setAddress(s.address || '');
        setCity(s.city || '');
        setPostalCode(s.postalCode || '');
        setRibIban(s.ribIban || '');
        setRibBic(s.ribBic || '');
        setBankName(s.bankName || '');
        setLogoUrl(s.logoUrl || '');
        setPdfPrimaryColor(s.pdfPrimaryColor || '#2563eb');
        setEmailQuoteSubject(s.emailQuoteSubject || emailQuoteSubject);
        setEmailQuoteBody(s.emailQuoteBody || emailQuoteBody);
        setEmailInvoiceSubject(s.emailInvoiceSubject || emailInvoiceSubject);
        setEmailInvoiceBody(s.emailInvoiceBody || emailInvoiceBody);
        setPaymentTerms(s.paymentTerms || paymentTerms);
        setPaymentDelayDays(String(s.paymentDelayDays || 30));
        setLegalMentions(s.legalMentions || '');
      }
      
      // Le backend renvoie maintenant billingType directement dans la réponse
      // Backend: 'spcp' = plateforme facture | 'self' = auto-facturation
      // Mobile UI: 'platform' = plateforme | 'self' = auto-facturation
      const backendBilling = (response as any).billingType || 'spcp';
      setBillingType(backendBilling === 'self' ? 'self' : 'platform');
    } catch (error: any) {
      console.error('Error loading settings:', error);
      Alert.alert('Erreur', 'Impossible de charger les paramètres');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Le billingType est défini par l'admin lors de l'invitation, pas modifiable ici
      const dataToSave: Record<string, any> = {
        companyName,
        siret,
        tvaNumber,
        address,
        city,
        postalCode,
        ribIban,
        ribBic,
        bankName,
        logoUrl,
        pdfPrimaryColor,
        emailQuoteSubject,
        emailQuoteBody,
        emailInvoiceSubject,
        emailInvoiceBody,
        paymentTerms,
        paymentDelayDays: parseInt(paymentDelayDays) || 30,
        legalMentions,
      };
      await api.saveBillingSettings(dataToSave);
      
      Alert.alert('Succès', 'Paramètres enregistrés avec succès');
    } catch (error: any) {
      Alert.alert('Erreur', error.message || 'Impossible d\'enregistrer les paramètres');
    } finally {
      setSaving(false);
    }
  };

  const pickLogo = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [3, 1],
      quality: 0.8,
      base64: true,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      
      // Show uploading state
      setLogoUrl(asset.uri); // Show preview immediately
      
      try {
        // Extract filename from URI
        const filename = asset.uri.split('/').pop() || 'logo.png';
        
        // Upload to server
        if (asset.base64) {
          const uploadResult = await api.uploadLogo(asset.base64, filename);
          if (uploadResult.success && uploadResult.logoUrl) {
            setLogoUrl(uploadResult.logoUrl);
            Alert.alert('Succès', 'Logo uploadé avec succès');
          } else {
            Alert.alert('Erreur', 'Impossible d\'uploader le logo');
          }
        } else {
          Alert.alert('Erreur', 'Impossible de lire l\'image');
        }
      } catch (error: any) {
        console.error('Logo upload error:', error);
        Alert.alert('Erreur', error.message || 'Erreur lors de l\'upload');
      }
    }
  };

  const removeLogo = async () => {
    Alert.alert(
      'Supprimer le logo',
      'Voulez-vous vraiment supprimer votre logo ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.deleteLogo();
              setLogoUrl('');
              Alert.alert('Succès', 'Logo supprimé');
            } catch (error: any) {
              Alert.alert('Erreur', error.message || 'Impossible de supprimer le logo');
            }
          },
        },
      ]
    );
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

  // Tech sous un TL → pas accès, la facturation est gérée par le TL
  if (isTechUnderTL) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Text style={styles.backButtonText}>← Retour</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Facturation</Text>
          <View style={{ width: 60 }} />
        </View>
        <View style={styles.blockedContainer}>
          <Text style={styles.blockedIcon}>🏢</Text>
          <Text style={styles.blockedTitle}>Facturation gérée par votre chef d'équipe</Text>
          <Text style={styles.blockedText}>
            Les factures et devis sont émis au nom de la société de votre chef d'équipe. Vous n'avez pas de paramètres de facturation à configurer.
          </Text>
          <TouchableOpacity
            style={styles.blockedButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.blockedButtonText}>Retour</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Retour</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Paramètres de facturation</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Mode de facturation - lecture seule, défini par l'admin */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Mode de facturation</Text>
          
          <View style={styles.readOnlyBanner}>
            <Text style={styles.readOnlyBannerText}>
              {billingType === 'self' 
                ? '🏪 Vous êtes en mode auto-facturation. Vous facturez avec votre propre société.'
                : '🏢 Vous êtes en mode plateforme. La plateforme gère la facturation pour vous.'
              }
            </Text>
            <Text style={[styles.readOnlyBannerText, { marginTop: 6, fontStyle: 'italic' }]}>
              Ce mode a été défini par votre administrateur et ne peut pas être modifié ici.
            </Text>
          </View>
        </View>

        {billingType === 'self' && (
          <>
            {/* Ma société */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Ma société</Text>
              <View style={styles.card}>
                {/* Logo */}
                <Text style={styles.inputLabel}>Logo</Text>
                <View style={styles.logoSection}>
                  <TouchableOpacity style={styles.logoContainer} onPress={pickLogo}>
                    {logoUrl ? (
                      <Image source={{ uri: logoUrl }} style={styles.logoPreview} resizeMode="contain" />
                    ) : (
                      <View style={styles.logoPlaceholder}>
                        <Text style={styles.logoPlaceholderText}>📷 Ajouter un logo</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                  {logoUrl && (
                    <View style={styles.logoActions}>
                      <TouchableOpacity style={styles.logoActionButton} onPress={pickLogo}>
                        <Text style={styles.logoActionText}>🔄 Changer</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.logoActionButton, styles.logoDeleteButton]} onPress={removeLogo}>
                        <Text style={styles.logoDeleteText}>🗑️ Supprimer</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>

                <Text style={styles.inputLabel}>Nom de la société *</Text>
                <TextInput
                  style={styles.input}
                  value={companyName}
                  onChangeText={setCompanyName}
                  placeholder="Ma Société SARL"
                />

                <View style={styles.row}>
                  <View style={styles.halfInput}>
                    <Text style={styles.inputLabel}>SIRET</Text>
                    <TextInput
                      style={styles.input}
                      value={siret}
                      onChangeText={setSiret}
                      placeholder="123 456 789 00012"
                      keyboardType="numeric"
                    />
                  </View>
                  <View style={styles.halfInput}>
                    <Text style={styles.inputLabel}>N° TVA</Text>
                    <TextInput
                      style={styles.input}
                      value={tvaNumber}
                      onChangeText={setTvaNumber}
                      placeholder="FR12345678901"
                    />
                  </View>
                </View>

                <Text style={styles.inputLabel}>Adresse</Text>
                <TextInput
                  style={styles.input}
                  value={address}
                  onChangeText={setAddress}
                  placeholder="123 rue de la Paix"
                />

                <View style={styles.row}>
                  <View style={styles.halfInput}>
                    <Text style={styles.inputLabel}>Code postal</Text>
                    <TextInput
                      style={styles.input}
                      value={postalCode}
                      onChangeText={setPostalCode}
                      placeholder="75000"
                      keyboardType="numeric"
                    />
                  </View>
                  <View style={styles.halfInput}>
                    <Text style={styles.inputLabel}>Ville</Text>
                    <TextInput
                      style={styles.input}
                      value={city}
                      onChangeText={setCity}
                      placeholder="Paris"
                    />
                  </View>
                </View>
              </View>
            </View>

            {/* Coordonnées bancaires */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Coordonnées bancaires</Text>
              <View style={styles.card}>
                <Text style={styles.inputLabel}>IBAN</Text>
                <TextInput
                  style={styles.input}
                  value={ribIban}
                  onChangeText={setRibIban}
                  placeholder="FR76 1234 5678 9012 3456 7890 123"
                  autoCapitalize="characters"
                />

                <View style={styles.row}>
                  <View style={styles.halfInput}>
                    <Text style={styles.inputLabel}>BIC</Text>
                    <TextInput
                      style={styles.input}
                      value={ribBic}
                      onChangeText={setRibBic}
                      placeholder="BNPAFRPP"
                      autoCapitalize="characters"
                    />
                  </View>
                  <View style={styles.halfInput}>
                    <Text style={styles.inputLabel}>Banque</Text>
                    <TextInput
                      style={styles.input}
                      value={bankName}
                      onChangeText={setBankName}
                      placeholder="BNP Paribas"
                    />
                  </View>
                </View>
              </View>
            </View>

            {/* Apparence PDF */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Apparence des documents</Text>
              <View style={styles.card}>
                <Text style={styles.inputLabel}>Couleur principale</Text>
                <View style={styles.colorRow}>
                  {['#2563eb', '#059669', '#dc2626', '#7c3aed', '#ea580c', '#0891b2'].map(color => (
                    <TouchableOpacity
                      key={color}
                      style={[
                        styles.colorOption,
                        { backgroundColor: color },
                        pdfPrimaryColor === color && styles.colorOptionSelected
                      ]}
                      onPress={() => setPdfPrimaryColor(color)}
                    />
                  ))}
                </View>
              </View>
            </View>

            {/* Templates email */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Email devis</Text>
              <View style={styles.card}>
                <Text style={styles.inputLabel}>Sujet</Text>
                <TextInput
                  style={styles.input}
                  value={emailQuoteSubject}
                  onChangeText={setEmailQuoteSubject}
                  placeholder="Votre devis #{reference}"
                />
                <Text style={styles.inputLabel}>Corps du message</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={emailQuoteBody}
                  onChangeText={setEmailQuoteBody}
                  multiline
                  numberOfLines={6}
                />
                <Text style={styles.helpText}>
                  Variables : {'{client_name}'}, {'{reference}'}, {'{company_name}'}, {'{amount}'}
                </Text>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Email facture</Text>
              <View style={styles.card}>
                <Text style={styles.inputLabel}>Sujet</Text>
                <TextInput
                  style={styles.input}
                  value={emailInvoiceSubject}
                  onChangeText={setEmailInvoiceSubject}
                  placeholder="Votre facture #{reference}"
                />
                <Text style={styles.inputLabel}>Corps du message</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={emailInvoiceBody}
                  onChangeText={setEmailInvoiceBody}
                  multiline
                  numberOfLines={6}
                />
              </View>
            </View>

            {/* Conditions de paiement */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Conditions de paiement</Text>
              <View style={styles.card}>
                <Text style={styles.inputLabel}>Délai de paiement (jours)</Text>
                <TextInput
                  style={styles.input}
                  value={paymentDelayDays}
                  onChangeText={setPaymentDelayDays}
                  keyboardType="numeric"
                  placeholder="30"
                />
                <Text style={styles.inputLabel}>Conditions</Text>
                <TextInput
                  style={styles.input}
                  value={paymentTerms}
                  onChangeText={setPaymentTerms}
                  placeholder="Paiement à réception de facture"
                />
                <Text style={styles.inputLabel}>Mentions légales</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={legalMentions}
                  onChangeText={setLegalMentions}
                  multiline
                  numberOfLines={4}
                  placeholder="Mentions légales à afficher sur les factures..."
                />
              </View>
            </View>
          </>
        )}

        {billingType === 'platform' && (
          <View style={styles.platformInfoCard}>
            <Text style={styles.platformInfoTitle}>🏢 Mode plateforme</Text>
            <Text style={styles.platformInfoText}>
              Vous n'avez pas besoin de configurer de paramètres de facturation.
            </Text>
            <Text style={styles.platformInfoText}>
              Les factures seront émises au nom de la plateforme et vous recevrez votre commission après paiement du client.
            </Text>
          </View>
        )}

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Footer with save button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.saveButton, saving && styles.buttonDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveButtonText}>Enregistrer</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: COLORS.primary,
  },
  backButton: {
    padding: 4,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 12,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  blockedContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  blockedIcon: {
    fontSize: 64,
    marginBottom: 20,
  },
  blockedTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 12,
  },
  blockedText: {
    fontSize: 15,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
  },
  blockedButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 12,
  },
  blockedButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  readOnlyBanner: {
    backgroundColor: '#f0f9ff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#bae6fd',
  },
  readOnlyBannerText: {
    fontSize: 14,
    color: '#0c4a6e',
    lineHeight: 20,
  },
  modeDescription: {
    fontSize: 13,
    color: COLORS.textMuted,
  },
  inputLabel: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: COLORS.text,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  halfInput: {
    flex: 1,
  },
  logoSection: {
    marginVertical: 8,
  },
  logoContainer: {
    marginBottom: 8,
  },
  logoPreview: {
    width: '100%',
    height: 80,
    borderRadius: 8,
    backgroundColor: '#f8fafc',
  },
  logoActions: {
    flexDirection: 'row',
    gap: 12,
  },
  logoActionButton: {
    flex: 1,
    backgroundColor: '#f3f4f6',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  logoActionText: {
    fontSize: 13,
    color: COLORS.text,
  },
  logoDeleteButton: {
    backgroundColor: '#fee2e2',
  },
  logoDeleteText: {
    fontSize: 13,
    color: '#dc2626',
  },
  logoPlaceholder: {
    width: '100%',
    height: 80,
    borderRadius: 8,
    backgroundColor: '#f8fafc',
    borderWidth: 2,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoPlaceholderText: {
    color: COLORS.textMuted,
    fontSize: 14,
  },
  colorRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  colorOption: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  colorOptionSelected: {
    borderWidth: 3,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  helpText: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 8,
    fontStyle: 'italic',
  },
  platformInfoCard: {
    backgroundColor: '#f0f9ff',
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: '#bae6fd',
  },
  platformInfoTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0369a1',
    marginBottom: 12,
  },
  platformInfoText: {
    fontSize: 14,
    color: '#0c4a6e',
    lineHeight: 22,
    marginBottom: 8,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    paddingBottom: 32,
    backgroundColor: COLORS.card,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  saveButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
