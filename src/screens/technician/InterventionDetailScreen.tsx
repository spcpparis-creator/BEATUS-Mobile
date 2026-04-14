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
  Image,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import api from '../../services/api';
import { COLORS, STATUS_COLORS, STATUS_LABELS, TYPE_LABELS } from '../../config/api';

interface Props {
  route: { params: { interventionId: string } };
  navigation: any;
}

export default function InterventionDetailScreen({ route, navigation }: Props) {
  const { interventionId, openCompletionForm } = route.params as { interventionId: string; openCompletionForm?: boolean };
  const [intervention, setIntervention] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [completionNote, setCompletionNote] = useState('');
  const [finalAmount, setFinalAmount] = useState('');
  const [materialCost, setMaterialCost] = useState('');
  const [description, setDescription] = useState('');
  const [timeSpent, setTimeSpent] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [showCompletionForm, setShowCompletionForm] = useState(openCompletionForm === true);

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
              await api.declineIntervention(interventionId);
              Alert.alert('Intervention refusée', 'Elle reste visible pour votre chef d\'équipe.');
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

  const handleTakePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission requise', 'L\'accès à la caméra est nécessaire pour prendre des photos.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      base64: false,
    });
    if (!result.canceled && result.assets[0]) {
      setPhotos(prev => [...prev, result.assets[0].uri]);
    }
  };

  const handlePickPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      allowsMultipleSelection: true,
      selectionLimit: 5,
    });
    if (!result.canceled && result.assets.length > 0) {
      setPhotos(prev => [...prev, ...result.assets.map(a => a.uri)]);
    }
  };

  const removePhoto = (index: number) => {
    setPhotos(prev => prev.filter((_, i) => i !== index));
  };

  const handleComplete = async () => {
    if (!finalAmount || parseFloat(finalAmount) <= 0) {
      Alert.alert('Erreur', 'Veuillez entrer un montant final valide');
      return;
    }

    setActionLoading('complete');
    try {
      const location = await getCurrentLocation();
      const completionData: any = {
        amountTTC: parseFloat(finalAmount),
        amountRealized: parseFloat(finalAmount),
        notes: completionNote || undefined,
        description: description || undefined,
        completedAt: new Date().toISOString(),
        location,
      };

      if (materialCost) {
        completionData.materialCost = parseFloat(materialCost);
        completionData.materialCostSelf = parseFloat(materialCost);
      }
      if (timeSpent) {
        completionData.timeSpent = parseFloat(timeSpent);
      }
      if (photos.length > 0) {
        completionData.photos = photos;
      }

      await api.completeIntervention(interventionId, completionData);

      const amt = parseFloat(finalAmount);
      const mat = parseFloat(materialCost) || 0;
      const gain = mat > 0 ? (amt - mat) : amt;
      Alert.alert(
        'Intervention terminée !',
        `Montant : ${formatCurrency(amt)}${mat > 0 ? `\nMatériel : ${formatCurrency(mat)}` : ''}${photos.length > 0 ? `\n${photos.length} photo(s) jointe(s)` : ''}`,
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (error: any) {
      Alert.alert('Erreur', error.message || 'Impossible de terminer l\'intervention');
    } finally {
      setActionLoading(null);
    }
  };

  const openMaps = () => {
    if (intervention?.address) {
      const addr = `${intervention.address.street || ''}, ${intervention.address.postalCode || ''} ${intervention.address.city || ''}`.trim();
      const encoded = encodeURIComponent(addr);
      const startNavAndRoute = (url: string) => {
        Linking.openURL(url);
        if (intervention.id && intervention.status === 'accepted') {
          api.updateInterventionStatus(intervention.id, 'en_route').then(() => loadIntervention()).catch(() => {});
        }
      };
      Alert.alert('Naviguer vers le client', addr, [
        { text: 'Waze', onPress: () => startNavAndRoute(`https://waze.com/ul?q=${encoded}&navigate=yes`) },
        { text: 'Plans', onPress: () => startNavAndRoute(Platform.OS === 'ios' ? `maps:?daddr=${encoded}` : `geo:0,0?q=${encoded}`) },
        { text: 'Google Maps', onPress: () => startNavAndRoute(`https://www.google.com/maps/search/?api=1&query=${encoded}`) },
        { text: 'Annuler', style: 'cancel' },
      ]);
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
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
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
              {(intervention.scheduledAt || intervention.scheduledDate || intervention.scheduled_at) ? formatDate(intervention.scheduledAt || intervention.scheduledDate || intervention.scheduled_at) : 'Non planifiée'}
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

        {/* Bilan financier (visible après complétion) */}
        {['completed', 'invoiced', 'paid'].includes(intervention.status) && (intervention.amountTTC || intervention.amountRealized || intervention.totalPaid !== undefined) && (() => {
          const encaisse = parseFloat(intervention.totalPaid || intervention.total_paid || 0);
          const montant = parseFloat(intervention.amountTTC || intervention.amountRealized || intervention.finalAmount || 0);
          const commission = parseFloat(intervention.commissionPercentage || intervention.commission_percentage || 30);
          const materialCostVal = parseFloat(intervention.materialCost || intervention.material_cost || 0);
          const materialOwed = parseFloat(intervention.materialOwed || intervention.material_owed || 0);
          const includesVente = intervention.includesVente ?? intervention.includes_vente ?? true;
          const includesPose = intervention.includesPose ?? intervention.includes_pose ?? true;
          const deductBefore = intervention.deductBeforeCommission ?? intervention.deduct_before_commission ?? false;
          const reversalSaved = parseFloat(intervention.reversalAmount || intervention.reversal_amount || 0);
          const remaining = parseFloat(intervention.remainingToPay || intervention.remaining_to_pay || 0);

          const splitLabel = !includesVente ? 'Pose seule' : !includesPose ? 'Vente seule' : 'Vente + Pose';
          const isSplit = !includesVente || !includesPose;

          return (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>💰 Bilan financier</Text>
              <View style={[styles.card, { gap: 6 }]}>
                {montant > 0 && (
                  <View style={styles.amountRow}>
                    <Text style={styles.amountLabel}>Montant TTC</Text>
                    <Text style={[styles.amountValue, { color: '#059669' }]}>{formatCurrency(montant)}</Text>
                  </View>
                )}
                {encaisse > 0 && (
                  <View style={styles.amountRow}>
                    <Text style={styles.amountLabel}>Encaissé</Text>
                    <Text style={[styles.amountValue, { color: '#059669' }]}>{formatCurrency(encaisse)}</Text>
                  </View>
                )}
                {remaining > 0 && (
                  <View style={styles.amountRow}>
                    <Text style={styles.amountLabel}>Reste à payer</Text>
                    <Text style={[styles.amountValue, { color: '#dc2626' }]}>{formatCurrency(remaining)}</Text>
                  </View>
                )}

                {/* Séparateur */}
                <View style={{ height: 1, backgroundColor: '#e5e7eb', marginVertical: 6 }} />

                {/* Détail du calcul */}
                <Text style={{ fontSize: 11, color: '#6b7280', fontWeight: '600', marginBottom: 4 }}>Détail reversement</Text>
                <View style={styles.amountRow}>
                  <Text style={styles.amountLabel}>Commission</Text>
                  <Text style={styles.amountValue}>{commission}%</Text>
                </View>
                <View style={styles.amountRow}>
                  <Text style={styles.amountLabel}>Prestation</Text>
                  <Text style={[styles.amountValue, isSplit ? { color: '#d97706' } : {}]}>{splitLabel}{isSplit ? ' (÷2)' : ''}</Text>
                </View>
                {materialCostVal > 0 && (
                  <View style={styles.amountRow}>
                    <Text style={styles.amountLabel}>Matériel déduit{deductBefore ? ' (avant comm.)' : ''}</Text>
                    <Text style={[styles.amountValue, { color: '#dc2626' }]}>- {formatCurrency(materialCostVal)}</Text>
                  </View>
                )}
                {materialOwed > 0 && (
                  <View style={styles.amountRow}>
                    <Text style={styles.amountLabel}>Matériel à payer</Text>
                    <Text style={[styles.amountValue, { color: '#059669' }]}>+ {formatCurrency(materialOwed)}</Text>
                  </View>
                )}

                {/* Résultat */}
                {reversalSaved > 0 && (() => {
                  const rStatus = intervention.reversalStatus || intervention.reversal_status || 'pending';
                  const rPaidAt = intervention.reversalPaidAt || intervention.reversal_paid_at;
                  const statusConfig: Record<string, { label: string; bg: string; color: string }> = {
                    pending: { label: 'En attente', bg: '#fef3c7', color: '#92400e' },
                    validated: { label: 'Validé', bg: '#dbeafe', color: '#1d4ed8' },
                    paid: { label: 'Payé', bg: '#dcfce7', color: '#166534' },
                  };
                  const sc = statusConfig[rStatus] || statusConfig.pending;
                  return (
                    <>
                      <View style={{ height: 1, backgroundColor: '#e5e7eb', marginVertical: 6 }} />
                      <View style={styles.amountRow}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Text style={[styles.amountLabel, { fontWeight: '700', fontSize: 14 }]}>Reversement</Text>
                          <View style={{ backgroundColor: sc.bg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
                            <Text style={{ fontSize: 11, fontWeight: '700', color: sc.color }}>{sc.label}</Text>
                          </View>
                        </View>
                        <Text style={[styles.amountValue, { fontWeight: '800', fontSize: 16, color: '#2563eb' }]}>{formatCurrency(reversalSaved)}</Text>
                      </View>
                      {rStatus === 'paid' && rPaidAt && (
                        <Text style={{ fontSize: 12, color: '#059669', marginTop: 4, textAlign: 'right' }}>
                          Payé le {new Date(rPaidAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}
                        </Text>
                      )}
                    </>
                  );
                })()}
              </View>
            </View>
          );
        })()}

        {/* Formulaire de complétion */}
        {showCompletionForm && canComplete && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📋 Rapport de fin d'intervention</Text>

            {/* Montants */}
            <View style={styles.card}>
              <Text style={styles.cardSubtitle}>💰 Montants</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Montant final TTC (€) *</Text>
                  <TextInput
                    style={styles.input}
                    value={finalAmount}
                    onChangeText={setFinalAmount}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Coût matériel (€)</Text>
                  <TextInput
                    style={styles.input}
                    value={materialCost}
                    onChangeText={setMaterialCost}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                  />
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Temps passé (heures)</Text>
                  <TextInput
                    style={styles.input}
                    value={timeSpent}
                    onChangeText={setTimeSpent}
                    keyboardType="decimal-pad"
                    placeholder="Ex: 1.5"
                  />
                </View>
                <View style={{ flex: 1 }} />
              </View>

              {/* Résumé des montants */}
              {parseFloat(finalAmount) > 0 && (
                <View style={styles.amountSummary}>
                  <View style={styles.amountSummaryRow}>
                    <Text style={styles.amountSummaryLabel}>Total TTC</Text>
                    <Text style={styles.amountSummaryValue}>{formatCurrency(parseFloat(finalAmount) || 0)}</Text>
                  </View>
                  {parseFloat(materialCost) > 0 && (
                    <View style={styles.amountSummaryRow}>
                      <Text style={styles.amountSummaryLabel}>Matériel</Text>
                      <Text style={[styles.amountSummaryValue, { color: '#ef4444' }]}>- {formatCurrency(parseFloat(materialCost) || 0)}</Text>
                    </View>
                  )}
                  {timeSpent ? (
                    <View style={styles.amountSummaryRow}>
                      <Text style={styles.amountSummaryLabel}>Temps</Text>
                      <Text style={styles.amountSummaryValue}>{timeSpent}h</Text>
                    </View>
                  ) : null}
                </View>
              )}
            </View>

            {/* Description et notes */}
            <View style={[styles.card, { marginTop: 12 }]}>
              <Text style={styles.cardSubtitle}>📝 Détails</Text>
              <Text style={styles.inputLabel}>Description des travaux</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={3}
                placeholder="Décrivez les travaux effectués..."
              />
              <Text style={styles.inputLabel}>Notes / Observations</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={completionNote}
                onChangeText={setCompletionNote}
                multiline
                numberOfLines={3}
                placeholder="Remarques, problèmes rencontrés..."
              />
            </View>

            {/* Photos */}
            <View style={[styles.card, { marginTop: 12 }]}>
              <Text style={styles.cardSubtitle}>📸 Photos</Text>
              <Text style={styles.photoHint}>Ajoutez des photos avant/après l'intervention</Text>
              
              <View style={styles.photosGrid}>
                {photos.map((uri, index) => (
                  <View key={index} style={styles.photoContainer}>
                    <Image source={{ uri }} style={styles.photoThumbnail} />
                    <TouchableOpacity
                      style={styles.photoRemoveBtn}
                      onPress={() => removePhoto(index)}
                    >
                      <Text style={styles.photoRemoveText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>

              <View style={styles.photoActions}>
                <TouchableOpacity style={styles.photoButton} onPress={handleTakePhoto}>
                  <Text style={styles.photoButtonText}>📷 Prendre une photo</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.photoButton, styles.photoButtonOutline]} onPress={handlePickPhoto}>
                  <Text style={styles.photoButtonOutlineText}>🖼️ Galerie</Text>
                </TouchableOpacity>
              </View>
            </View>

          </View>
        )}

        <View style={{ height: ['completed', 'cancelled', 'paid', 'invoiced'].includes(status) ? 40 : 120 }} />
      </ScrollView>

      {/* Actions — masquées pour les interventions terminées/annulées */}
      {!['completed', 'cancelled', 'paid', 'invoiced'].includes(status) && (
      <View style={styles.actionsContainer}>
        {showCompletionForm ? (
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
        ) : (
          <>
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

            {canComplete && (
              <TouchableOpacity
                style={[styles.actionButton, styles.completeButton]}
                onPress={() => setShowCompletionForm(true)}
              >
                <Text style={styles.actionButtonText}>✓ Terminer l'intervention</Text>
              </TouchableOpacity>
            )}

            {/* Bouton Message - lié à l'intervention */}
            <TouchableOpacity
              style={styles.messageButton}
              onPress={() => navigation.navigate('Messaging', {
                interventionId,
                interventionRef: intervention.reference,
              })}
            >
              <Text style={styles.messageButtonText}>💬 Message ({intervention.reference})</Text>
            </TouchableOpacity>

            {/* Boutons Devis et Facture */}
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
          </>
        )}
      </View>
      )}
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
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  // Styles pour la barre de progression
  progressContainer: {
    backgroundColor: '#fff',
    paddingVertical: 20,
    paddingHorizontal: 16,
    marginHorizontal: 20,
    marginTop: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
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
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginLeft: -8,
    minHeight: 44,
    minWidth: 44,
    justifyContent: 'center',
  },
  backButtonText: {
    color: COLORS.primary,
    fontSize: 17,
    fontWeight: '600',
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
    backgroundColor: '#ffffff',
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  reference: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  type: {
    fontSize: 16,
    color: COLORS.textMuted,
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
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
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
  messageButton: {
    backgroundColor: '#eff6ff',
    borderWidth: 2,
    borderColor: '#2563eb',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  messageButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1d4ed8',
  },
  billingButtonsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
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
  cardSubtitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 12,
  },
  amountSummary: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  amountSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  amountSummaryLabel: {
    fontSize: 14,
    color: '#6b7280',
  },
  amountSummaryValue: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  photoHint: {
    fontSize: 13,
    color: '#9ca3af',
    marginBottom: 10,
  },
  photosGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  photoContainer: {
    position: 'relative',
    width: 80,
    height: 80,
    borderRadius: 10,
    overflow: 'hidden',
  },
  photoThumbnail: {
    width: '100%',
    height: '100%',
    borderRadius: 10,
  },
  photoRemoveBtn: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: 'rgba(0,0,0,0.6)',
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoRemoveText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  photoActions: {
    flexDirection: 'row',
    gap: 10,
  },
  photoButton: {
    flex: 1,
    backgroundColor: '#2563eb',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  photoButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  photoButtonOutline: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#2563eb',
  },
  photoButtonOutlineText: {
    color: '#2563eb',
    fontSize: 14,
    fontWeight: '600',
  },
});
