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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS } from '../../config/api';
import api from '../../services/api';

interface Props {
  navigation: any;
}

export default function EmailSettingsScreen({ navigation }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [signature, setSignature] = useState('');
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const templates = await api.getUserTemplates();
      const emailTemplate = templates.find((t: any) => t.templateType === 'email_signature');
      if (emailTemplate?.content) {
        setSignature(emailTemplate.content);
      }
    } catch (error) {
      console.error('Erreur chargement signature:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.saveUserTemplate('email_signature', signature);
      Alert.alert('Succès', 'Signature email sauvegardée');
      navigation.goBack();
    } catch (error: any) {
      Alert.alert('Erreur', error.message || 'Impossible de sauvegarder');
    } finally {
      setSaving(false);
    }
  };

  const insertTemplate = (template: string) => {
    const templates: Record<string, string> = {
      simple: `Cordialement,

{nom}
{entreprise}
{telephone}`,
      professional: `Cordialement,

{nom}
{poste}
{entreprise}

📞 {telephone}
✉️ {email}
🌐 {site_web}`,
      detailed: `Bien cordialement,

{nom}
{poste} | {entreprise}
────────────────────
📞 {telephone}
✉️ {email}
📍 {adresse}
🌐 {site_web}

{mentions_legales}`,
    };
    setSignature(templates[template] || '');
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
        <Text style={styles.title}>Signature email</Text>
        <Text style={styles.subtitle}>Personnalisez vos emails automatiques</Text>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Templates prédéfinis */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📋 Modèles prédéfinis</Text>
          <View style={styles.templates}>
            <TouchableOpacity 
              style={styles.templateButton}
              onPress={() => insertTemplate('simple')}
            >
              <Text style={styles.templateButtonText}>Simple</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.templateButton}
              onPress={() => insertTemplate('professional')}
            >
              <Text style={styles.templateButtonText}>Pro</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.templateButton}
              onPress={() => insertTemplate('detailed')}
            >
              <Text style={styles.templateButtonText}>Détaillé</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Éditeur signature */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>✉️ Votre signature</Text>
            <TouchableOpacity onPress={() => setShowPreview(!showPreview)}>
              <Text style={styles.previewToggle}>
                {showPreview ? '✏️ Éditer' : '👁️ Aperçu'}
              </Text>
            </TouchableOpacity>
          </View>
          
          {showPreview ? (
            <View style={styles.preview}>
              <Text style={styles.previewLabel}>Aperçu de l'email :</Text>
              <View style={styles.previewContent}>
                <Text style={styles.previewText}>Bonjour,</Text>
                <Text style={styles.previewText}>{'\n'}Veuillez trouver ci-joint votre document.{'\n'}</Text>
                <View style={styles.previewDivider} />
                <Text style={styles.previewSignature}>{signature || 'Pas de signature'}</Text>
              </View>
            </View>
          ) : (
            <TextInput
              style={styles.signatureInput}
              value={signature}
              onChangeText={setSignature}
              placeholder="Saisissez votre signature email..."
              multiline
              numberOfLines={10}
              textAlignVertical="top"
            />
          )}
        </View>

        {/* Variables disponibles */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🏷️ Variables disponibles</Text>
          <Text style={styles.variablesInfo}>
            Utilisez ces variables qui seront remplacées automatiquement :
          </Text>
          <View style={styles.variablesList}>
            {[
              { key: '{nom}', desc: 'Votre nom' },
              { key: '{entreprise}', desc: 'Nom de l\'entreprise' },
              { key: '{telephone}', desc: 'Téléphone' },
              { key: '{email}', desc: 'Email' },
              { key: '{adresse}', desc: 'Adresse' },
              { key: '{poste}', desc: 'Poste/Titre' },
              { key: '{site_web}', desc: 'Site web' },
            ].map((v) => (
              <TouchableOpacity 
                key={v.key}
                style={styles.variableItem}
                onPress={() => setSignature(signature + v.key)}
              >
                <Text style={styles.variableKey}>{v.key}</Text>
                <Text style={styles.variableDesc}>{v.desc}</Text>
              </TouchableOpacity>
            ))}
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
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  previewToggle: {
    fontSize: 14,
    color: '#7c3aed',
    fontWeight: '500',
  },
  templates: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  templateButton: {
    flex: 1,
    backgroundColor: '#f5f3ff',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  templateButtonText: {
    color: '#7c3aed',
    fontWeight: '600',
    fontSize: 14,
  },
  signatureInput: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: COLORS.text,
    minHeight: 200,
    fontFamily: 'monospace',
  },
  preview: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 16,
  },
  previewLabel: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginBottom: 12,
  },
  previewContent: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  previewText: {
    fontSize: 14,
    color: COLORS.text,
    lineHeight: 22,
  },
  previewDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 12,
  },
  previewSignature: {
    fontSize: 14,
    color: COLORS.text,
    lineHeight: 22,
  },
  variablesInfo: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginTop: 8,
    marginBottom: 12,
  },
  variablesList: {
    gap: 8,
  },
  variableItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f3ff',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  variableKey: {
    fontFamily: 'monospace',
    fontSize: 13,
    color: '#7c3aed',
    fontWeight: '600',
    width: 100,
  },
  variableDesc: {
    flex: 1,
    fontSize: 13,
    color: COLORS.textMuted,
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
