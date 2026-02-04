import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Linking,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import api from '../../services/api';
import { COLORS, STATUS_COLORS, STATUS_LABELS, TYPE_LABELS } from '../../config/api';

interface Props {
  route: { params: { interventionId: string } };
  navigation: any;
}

export default function InterventionDetailScreen({ route, navigation }: Props) {
  const { interventionId } = route.params;
  const [intervention, setIntervention] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [completionNote, setCompletionNote] = useState('');
  const [finalAmount, setFinalAmount] = useState('');
  const [showCompletionForm, setShowCompletionForm] = useState(false);

  useEffect(() => {
    loadIntervention();
  }, [interventionId]);

  const loadIntervention = async () => {
    try {
      const data = await api.getIntervention(interventionId);
      setIntervention(data);
      if (data.estimatedAmount) {
        setFinalAmount(String(data.estimatedAmount));
      }
    } catch (error: any) {
      Alert.alert('Erreur', error.message || 'Impossible de charger l\'intervention');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  };

  const getCurrentLocation = async (): Promise<{ lat: number; lng: number } | undefined> => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const location = await Location.getCurrentPositionAsync({});
        return { lat: location.coords.latitude, lng: location.coords.longitude };
      }
    } catch (error) {
      console.error('Erreur GPS:', error);
    }
    return undefined;
  };

  const handleAccept = async () => {
    setActionLoading('accept');
    try {
      const location = await getCurrentLocation();
      await api.acceptIntervention(interventionId, location);
      Alert.alert('Succès', 'Intervention acceptée !');
      loadIntervention();
    } catch (error: any) {
      Alert.alert('Erreur', error.message || 'Impossible d\'accepter');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDecline = async () => {
    Alert.alert(
      'Refuser l\'intervention',
      'Êtes-vous sûr de vouloir refuser cette intervention ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Refuser',
          style: 'destructive',
          onPress: async () => {
            setActionLoading('decline');
            try {
              await api.cancelIntervention(interventionId, 'Refusée par le technicien');
              Alert.alert('Intervention refusée');
              navigation.goBack();
            } catch (error: any) {
              Alert.alert('Erreur', error.message);
            } finally {
              setActionLoading(null);
            }
          },
        },
      ]
    );
  };

  const handleStatusChange = async (newStatus: string) => {
    setActionLoading(newStatus);
    try {
      const location = await getCurrentLocation();
      await api.updateInterventionStatus(interventionId, newStatus);
      if (location) {
        await api.updateLocation(location.lat, location.lng);
      }
      Alert.alert('Succès', `Statut mis à jour : ${STATUS_LABELS[newStatus] || newStatus}`);
      loadIntervention();
    } catch (error: any) {
      Alert.alert('Erreur', error.message || 'Impossible de mettre à jour le statut');
    } finally {
      setActionLoading(null);
    }
  };

  const handleComplete = async () => {
    if (!finalAmount || parseFloat(finalAmount) <= 0) {
      Alert.alert('Erreur', 'Veuillez entrer un montant final valide');
      return;
    }

    setActionLoading('complete');
    try {
      const location = await getCurrentLocation();
      await api.completeIntervention(interventionId, {
        // Envoyer amountTTC pour SPCP billing, amountRealized pour self billing
        amountTTC: parseFloat(finalAmount),
        amountRealized: parseFloat(finalAmount),
        notes: completionNote,
        completedAt: new Date().toISOString(),
        location,
      });
      Alert.alert('Succès', 'Intervention terminée avec succès !');
      navigation.goBack();
    } catch (error: any) {
      Alert.alert('Erreur', error.message || 'Impossible de terminer l\'intervention');
    } finally {
      setActionLoading(null);
    }
  };

  const openMaps = () => {
    if (intervention?.address) {
      const address = encodeURIComponent(
        `${intervention.address.street || ''} ${intervention.address.city || ''} ${intervention.address.postalCode || ''}`
      );
      const url = `https://www.google.com/maps/search/?api=1&query=${address}`;
      Linking.openURL(url);
    }
  };

  const callClient = () => {
    if (intervention?.clientPhone) {
      Linking.openURL(`tel:${intervention.clientPhone}`);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (!intervention) {
    return (
      <View style={styles.loadingContainer}>
        <Text>Intervention non trouvée</Text>
      </View>
    );
  }

  const status = intervention.status;
  const canAccept = ['pending', 'assigned', 'notified'].includes(status);
  const canStartRoute = status === 'accepted';
  const canArriveOnSite = status === 'en_route';
  const canComplete = ['on_site', 'in_progress'].includes(status);
  
  // Déterminer l'étape actuelle pour la barre de progression
  const getProgressStep = () => {
    switch (status) {
      case 'pending':
      case 'assigned':
      case 'notified':
        return 0; // Pas encore accepté
      case 'accepted':
        return 1; // Accepté
      case 'en_route':
        return 2; // En route
      case 'on_site':
      case 'in_progress':
        return 3; // Sur place
      case 'completed':
      case 'invoiced':
      case 'paid':
        return 4; // Terminé
      default:
        return 0;
    }
  };
  
  const currentStep = getProgressStep();
  const isAccepted = currentStep >= 1;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView style={styles.scrollView}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Text style={styles.backButtonText}>← Retour</Text>
          </TouchableOpacity>
          <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[status] || '#6b7280' }]}>
            <Text style={styles.statusBadgeText}>{STATUS_LABELS[status] || status}</Text>
          </View>
        </View>

        {/* Reference */}
        <View style={styles.referenceContainer}>
          <Text style={styles.reference}>{intervention.reference}</Text>
          <Text style={styles.type}>{TYPE_LABELS[intervention.type] || intervention.type}</Text>
        </View>
        
        {/* Barre de progression - visible uniquement après acceptation */}
        {isAccepted && (
          <View style={styles.progressContainer}>
            <View style={styles.progressBar}>
              {/* Étape 1: Accepté */}
              <View style={styles.progressStep}>
                <View style={[
                  styles.progressDot,
                  currentStep >= 1 && styles.progressDotActive,
                  currentStep === 1 && styles.progressDotCurrent
                ]}>
                  <Text style={styles.progressDotText}>✓</Text>
                </View>
                <Text style={[styles.progressLabel, currentStep >= 1 && styles.progressLabelActive]}>
                  Accepté
                </Text>
              </View>
              
              {/* Ligne de connexion */}
              <View style={[styles.progressLine, currentStep >= 2 && styles.progressLineActive]} />
              
              {/* Étape 2: En route */}
              <View style={styles.progressStep}>
                <View style={[
                  styles.progressDot,
                  currentStep >= 2 && styles.progressDotActive,
                  currentStep === 2 && styles.progressDotCurrent
                ]}>
                  <Text style={styles.progressDotText}>🚗</Text>
                </View>
                <Text style={[styles.progressLabel, currentStep >= 2 && styles.progressLabelActive]}>
                  En route
                </Text>
              </View>
              
              {/* Ligne de connexion */}
              <View style={[styles.progressLine, currentStep >= 3 && styles.progressLineActive]} />
              
              {/* Étape 3: Sur place */}
              <View style={styles.progressStep}>
                <View style={[
                  styles.progressDot,
                  currentStep >= 3 && styles.progressDotActive,
                  currentStep === 3 && styles.progressDotCurrent
                ]}>
                  <Text style={styles.progressDotText}>📍</Text>
                </View>
                <Text style={[styles.progressLabel, currentStep >= 3 && styles.progressLabelActive]}>
                  Sur place
                </Text>
              </View>
              
              {/* Ligne de connexion */}
              <View style={[styles.progressLine, currentStep >= 4 && styles.progressLineActive]} />
              
              {/* Étape 4: Terminé */}
              <View style={styles.progressStep}>
                <View style={[
                  styles.progressDot,
                  currentStep >= 4 && styles.progressDotActive,
                  currentStep === 4 && styles.progressDotCurrent
                ]}>
                  <Text style={styles.progressDotText}>✓</Text>
                </View>
                <Text style={[styles.progressLabel, currentStep >= 4 && styles.progressLabelActive]}>
                  Terminé
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Client */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Client</Text>
          <View style={styles.card}>
            <Text style={styles.clientName}>{intervention.clientName || intervention.client?.name || 'Client'}</Text>
            {intervention.clientPhone && (
              <TouchableOpacity style={styles.contactRow} onPress={callClient}>
                <Text style={styles.contactIcon}>📞</Text>
                <Text style={styles.contactText}>{intervention.clientPhone}</Text>
                <Text style={styles.contactAction}>Appeler</Text>
              </TouchableOpacity>
            )}
            {intervention.clientEmail && (
              <View style={styles.contactRow}>
                <Text style={styles.contactIcon}>✉️</Text>
                <Text style={styles.contactText}>{intervention.clientEmail}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Adresse */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Adresse</Text>
          <TouchableOpacity style={styles.card} onPress={openMaps}>
            <View style={styles.addressRow}>
              <Text style={styles.addressIcon}>📍</Text>
              <View style={styles.addressContent}>
                {intervention.address?.street && (
                  <Text style={styles.addressText}>{intervention.address.street}</Text>
                )}
                <Text style={styles.addressText}>
                  {intervention.address?.postalCode} {intervention.address?.city}
                </Text>
              </View>
              <Text style={styles.addressAction}>Itinéraire →</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Date */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Date prévue</Text>
          <View style={styles.card}>
            <Text style={styles.dateText}>
              {intervention.scheduledDate ? formatDate(intervention.scheduledDate) : 'Non planifiée'}
            </Text>
          </View>
        </View>

        {/* Description */}
        {intervention.description && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Description</Text>
            <View style={styles.card}>
              <Text style={styles.descriptionText}>{intervention.description}</Text>
            </View>
          </View>
        )}

        {/* Montant */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Montant</Text>
          <View style={styles.card}>
            <View style={styles.amountRow}>
              <Text style={styles.amountLabel}>Estimé :</Text>
              <Text style={styles.amountValue}>
                {intervention.estimatedAmount ? formatCurrency(intervention.estimatedAmount) : 'Non défini'}
              </Text>
            </View>
            {intervention.finalAmount && (
              <View style={styles.amountRow}>
                <Text style={styles.amountLabel}>Final :</Text>
                <Text style={[styles.amountValue, styles.amountFinal]}>
                  {formatCurrency(intervention.finalAmount)}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Formulaire de complétion */}
        {showCompletionForm && canComplete && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Terminer l'intervention</Text>
            <View style={styles.card}>
              <Text style={styles.inputLabel}>Montant final (€)</Text>
              <TextInput
                style={styles.input}
                value={finalAmount}
                onChangeText={setFinalAmount}
                keyboardType="decimal-pad"
                placeholder="0.00"
              />
              <Text style={styles.inputLabel}>Notes / Observations</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={completionNote}
                onChangeText={setCompletionNote}
                multiline
                numberOfLines={4}
                placeholder="Travaux effectués, remarques..."
              />
              <TouchableOpacity
                style={[styles.actionButton, styles.completeButton]}
                onPress={handleComplete}
                disabled={actionLoading === 'complete'}
              >
                {actionLoading === 'complete' ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.actionButtonText}>✓ Terminer l'intervention</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Actions */}
      <View style={styles.actionsContainer}>
        {canAccept && (
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={[styles.actionButton, styles.declineButton]}
              onPress={handleDecline}
              disabled={actionLoading !== null}
            >
              {actionLoading === 'decline' ? (
                <ActivityIndicator color={COLORS.danger} />
              ) : (
                <Text style={styles.declineButtonText}>✕ Refuser</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, styles.acceptButton]}
              onPress={handleAccept}
              disabled={actionLoading !== null}
            >
              {actionLoading === 'accept' ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.actionButtonText}>✓ Accepter</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {canStartRoute && (
          <TouchableOpacity
            style={[styles.actionButton, styles.primaryButton]}
            onPress={() => handleStatusChange('en_route')}
            disabled={actionLoading !== null}
          >
            {actionLoading === 'en_route' ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.actionButtonText}>🚗 Je suis en route</Text>
            )}
          </TouchableOpacity>
        )}

        {canArriveOnSite && (
          <TouchableOpacity
            style={[styles.actionButton, styles.primaryButton]}
            onPress={() => handleStatusChange('on_site')}
            disabled={actionLoading !== null}
          >
            {actionLoading === 'on_site' ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.actionButtonText}>📍 Je suis arrivé</Text>
            )}
          </TouchableOpacity>
        )}

        {canComplete && !showCompletionForm && (
          <TouchableOpacity
            style={[styles.actionButton, styles.completeButton]}
            onPress={() => setShowCompletionForm(true)}
          >
            <Text style={styles.actionButtonText}>✓ Terminer l'intervention</Text>
          </TouchableOpacity>
        )}

        {/* Boutons Devis et Facture - toujours visibles */}
        <View style={styles.billingButtonsRow}>
          <TouchableOpacity
            style={[styles.billingButton, styles.quoteButton]}
            onPress={() => navigation.navigate('CreateQuote', { interventionId, intervention })}
          >
            <Text style={styles.quoteButtonText}>📄 Devis</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.billingButton, styles.invoiceButton]}
            onPress={() => navigation.navigate('CreateInvoice', { interventionId, intervention })}
          >
            <Text style={styles.invoiceButtonText}>🧾 Facture</Text>
          </TouchableOpacity>
        </View>

        {/* Afficher le devis/facture existant si présent */}
        {intervention?.quoteId && (
          <TouchableOpacity
            style={styles.existingDocButton}
            onPress={() => navigation.navigate('QuoteDetail', { quoteId: intervention.quoteId })}
          >
            <Text style={styles.existingDocText}>📄 Voir le devis</Text>
          </TouchableOpacity>
        )}
        {intervention?.invoiceId && (
          <TouchableOpacity
            style={styles.existingDocButton}
            onPress={() => navigation.navigate('InvoiceDetail', { invoiceId: intervention.invoiceId })}
          >
            <Text style={styles.existingDocText}>🧾 Voir la facture</Text>
          </TouchableOpacity>
        )}
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
    backgroundColor: COLORS.background,
  },
  scrollView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: COLORS.primary,
  },
  // Styles pour la barre de progression
  progressContainer: {
    backgroundColor: '#fff',
    paddingVertical: 20,
    paddingHorizontal: 16,
    marginHorizontal: 20,
    marginTop: -12,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
    zIndex: 10,
  },
  progressBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressStep: {
    alignItems: 'center',
    width: 60,
  },
  progressDot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#e5e7eb',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#d1d5db',
  },
  progressDotActive: {
    backgroundColor: COLORS.success,
    borderColor: COLORS.success,
  },
  progressDotCurrent: {
    borderColor: COLORS.primary,
    borderWidth: 3,
    transform: [{ scale: 1.1 }],
  },
  progressDotText: {
    fontSize: 16,
  },
  progressLabel: {
    marginTop: 6,
    fontSize: 10,
    color: '#9ca3af',
    fontWeight: '500',
    textAlign: 'center',
  },
  progressLabelActive: {
    color: COLORS.success,
    fontWeight: '600',
  },
  progressLine: {
    flex: 1,
    height: 3,
    backgroundColor: '#e5e7eb',
    marginBottom: 20,
  },
  progressLineActive: {
    backgroundColor: COLORS.success,
  },
  backButton: {
    padding: 8,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  referenceContainer: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 20,
    paddingBottom: 24,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  reference: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
  },
  type: {
    fontSize: 16,
    color: '#bfdbfe',
    marginTop: 4,
  },
  section: {
    paddingHorizontal: 20,
    marginTop: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textMuted,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  clientName: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 12,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  contactIcon: {
    fontSize: 16,
    marginRight: 10,
  },
  contactText: {
    flex: 1,
    fontSize: 15,
    color: COLORS.text,
  },
  contactAction: {
    color: COLORS.primary,
    fontWeight: '600',
    fontSize: 14,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  addressIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  addressContent: {
    flex: 1,
  },
  addressText: {
    fontSize: 15,
    color: COLORS.text,
    lineHeight: 22,
  },
  addressAction: {
    color: COLORS.primary,
    fontWeight: '600',
    fontSize: 14,
  },
  dateText: {
    fontSize: 16,
    color: COLORS.text,
    textTransform: 'capitalize',
  },
  descriptionText: {
    fontSize: 15,
    color: COLORS.text,
    lineHeight: 22,
  },
  amountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  amountLabel: {
    fontSize: 15,
    color: COLORS.textMuted,
  },
  amountValue: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
  },
  amountFinal: {
    color: COLORS.success,
  },
  inputLabel: {
    fontSize: 14,
    color: COLORS.textMuted,
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: COLORS.text,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  actionsContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.card,
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingBottom: 32,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 10,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptButton: {
    backgroundColor: COLORS.success,
  },
  declineButton: {
    backgroundColor: '#fee2e2',
  },
  primaryButton: {
    backgroundColor: COLORS.primary,
  },
  completeButton: {
    backgroundColor: COLORS.success,
    marginTop: 12,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  declineButtonText: {
    color: COLORS.danger,
    fontSize: 16,
    fontWeight: '600',
  },
  billingButtonsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  billingButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  quoteButton: {
    backgroundColor: '#f0f9ff',
    borderColor: '#0ea5e9',
  },
  invoiceButton: {
    backgroundColor: '#f0fdf4',
    borderColor: '#22c55e',
  },
  billingButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  quoteButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0369a1',
  },
  invoiceButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#15803d',
  },
  existingDocButton: {
    backgroundColor: '#f8fafc',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginTop: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  existingDocText: {
    fontSize: 14,
    color: COLORS.primary,
    fontWeight: '500',
  },
});
