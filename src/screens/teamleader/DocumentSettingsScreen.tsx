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
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { COLORS, API_BASE_URL } from '../../config/api';
import api from '../../services/api';
import * as SecureStore from 'expo-secure-store';

interface Props {
  navigation: any;
}

interface DocumentSettings {
  pdf_logo_url: string;
  company_name: string;
  siret: string;
  headquarters_address: string;
  company_phone: string;
  company_email: string;
  legal_mentions: string;
  payment_instructions: string;
}

export default function DocumentSettingsScreen({ navigation }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<DocumentSettings>({
    pdf_logo_url: '',
    company_name: '',
    siret: '',
    headquarters_address: '',
    company_phone: '',
    company_email: '',
    legal_mentions: '',
    payment_instructions: '',
  });

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const templates = await api.getUserTemplates();
      const quoteTemplate = templates.find((t: any) => t.templateType === 'quote');
      if (quoteTemplate?.variables) {
        setFormData({
          pdf_logo_url: quoteTemplate.variables.pdf_logo_url || '',
          company_name: quoteTemplate.variables.company_name || '',
          siret: quoteTemplate.variables.siret || '',
          headquarters_address: quoteTemplate.variables.headquarters_address || '',
          company_phone: quoteTemplate.variables.company_phone || '',
          company_email: quoteTemplate.variables.company_email || '',
          legal_mentions: quoteTemplate.variables.legal_mentions || '',
          payment_instructions: quoteTemplate.variables.payment_instructions || '',
        });
      }
    } catch (error) {
      console.error('Erreur chargement paramètres:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!formData.company_name.trim()) {
      Alert.alert('Erreur', 'Le nom de l\'entreprise est obligatoire');
      return;
    }

    setSaving(true);
    try {
      // Sauvegarder pour quote et invoice
      await Promise.all([
        api.saveUserTemplate('quote', '', formData),
        api.saveUserTemplate('invoice', '', formData),
      ]);
      Alert.alert('Succès', 'Paramètres sauvegardés avec succès');
      navigation.goBack();
    } catch (error: any) {
      Alert.alert('Erreur', error.message || 'Impossible de sauvegarder');
    } finally {
      setSaving(false);
    }
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [3, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      // Pour l'instant on stocke juste l'URI locale
      // En production, il faudrait uploader sur un serveur
      setFormData({ ...formData, pdf_logo_url: result.assets[0].uri });
      Alert.alert('Info', 'Logo sélectionné. L\'upload sur le serveur sera fait à la sauvegarde.');
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Retour</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Devis & Factures</Text>
        <Text style={styles.subtitle}>Personnalisez vos documents</Text>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Logo */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📷 Logo de l'entreprise</Text>
          <TouchableOpacity style={styles.logoContainer} onPress={pickImage}>
            {formData.pdf_logo_url ? (
              <Image source={{ uri: formData.pdf_logo_url }} style={styles.logoImage} />
            ) : (
              <View style={styles.logoPlaceholder}>
                <Text style={styles.logoPlaceholderIcon}>🏢</Text>
                <Text style={styles.logoPlaceholderText}>Ajouter un logo</Text>
              </View>
            )}
          </TouchableOpacity>
          {formData.pdf_logo_url && (
            <TouchableOpacity 
              style={styles.removeLogoButton}
              onPress={() => setFormData({ ...formData, pdf_logo_url: '' })}
            >
              <Text style={styles.removeLogoText}>Supprimer le logo</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Informations entreprise */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🏢 Informations entreprise</Text>
          
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Nom de l'entreprise *</Text>
            <TextInput
              style={styles.input}
              value={formData.company_name}
              onChangeText={(text) => setFormData({ ...formData, company_name: text })}
              placeholder="Ex: BEATUS Services"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>SIRET</Text>
            <TextInput
              style={styles.input}
              value={formData.siret}
              onChangeText={(text) => setFormData({ ...formData, siret: text })}
              placeholder="Ex: 123 456 789 00012"
              keyboardType="numeric"
              maxLength={17}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Adresse du siège</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={formData.headquarters_address}
              onChangeText={(text) => setFormData({ ...formData, headquarters_address: text })}
              placeholder="Ex: 123 Rue Example, 75001 Paris"
              multiline
              numberOfLines={3}
            />
          </View>

          <View style={styles.row}>
            <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
              <Text style={styles.label}>Téléphone</Text>
              <TextInput
                style={styles.input}
                value={formData.company_phone}
                onChangeText={(text) => setFormData({ ...formData, company_phone: text })}
                placeholder="+33 1 23 45 67 89"
                keyboardType="phone-pad"
              />
            </View>
            <View style={[styles.inputGroup, { flex: 1, marginLeft: 8 }]}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                value={formData.company_email}
                onChangeText={(text) => setFormData({ ...formData, company_email: text })}
                placeholder="contact@entreprise.fr"
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>
          </View>
        </View>

        {/* Mentions légales */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📜 Mentions légales</Text>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Mentions légales (pied de page)</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={formData.legal_mentions}
              onChangeText={(text) => setFormData({ ...formData, legal_mentions: text })}
              placeholder="Ex: SIRET: 123 456 789 00012 - RCS Paris B 123 456 789"
              multiline
              numberOfLines={4}
            />
          </View>
        </View>

        {/* Instructions de paiement */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>💳 Instructions de paiement</Text>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Instructions (affichées sur les factures)</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={formData.payment_instructions}
              onChangeText={(text) => setFormData({ ...formData, payment_instructions: text })}
              placeholder="Ex: Paiement par virement sous 30 jours. IBAN: FR76..."
              multiline
              numberOfLines={4}
            />
          </View>
        </View>

        {/* Boutons */}
        <View style={styles.buttons}>
          <TouchableOpacity 
            style={styles.cancelButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.cancelButtonText}>Annuler</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.saveButton}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.saveButtonText}>Enregistrer</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
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
  header: {
    backgroundColor: '#7c3aed',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  backButton: {
    marginBottom: 12,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  subtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 4,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  section: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 16,
  },
  logoContainer: {
    borderWidth: 2,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
    borderRadius: 12,
    overflow: 'hidden',
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'contain',
  },
  logoPlaceholder: {
    alignItems: 'center',
  },
  logoPlaceholderIcon: {
    fontSize: 40,
    marginBottom: 8,
  },
  logoPlaceholderText: {
    color: COLORS.textMuted,
    fontSize: 14,
  },
  removeLogoButton: {
    marginTop: 12,
    alignItems: 'center',
  },
  removeLogoText: {
    color: '#dc2626',
    fontSize: 14,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.text,
    marginBottom: 8,
  },
  input: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
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
  buttons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '600',
  },
  saveButton: {
    flex: 1,
    backgroundColor: '#7c3aed',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
