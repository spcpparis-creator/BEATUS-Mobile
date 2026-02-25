import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import api from '../../services/api';
import { COLORS } from '../../config/api';

interface Props {
  navigation: any;
}

export default function SumUpSettingsScreen({ navigation }: Props) {
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  
  // Permissions
  const [canManage, setCanManage] = useState(false);
  const [permissionReason, setPermissionReason] = useState<string | null>(null);
  
  // Statut connexion
  const [connected, setConnected] = useState(false);
  const [merchantId, setMerchantId] = useState<string | null>(null);
  const [merchantCode, setMerchantCode] = useState<string | null>(null);
  const [connectedAt, setConnectedAt] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      loadStatus();
    });
    return unsubscribe;
  }, [navigation]);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const status = await api.getSumUpStatus();
      setConnected(status.connected);
      setMerchantId(status.merchantId);
      setMerchantCode(status.merchantCode);
      setConnectedAt(status.connectedAt);
      setCanManage(status.canManage);
      setPermissionReason(status.permissionReason);
    } catch (error: any) {
      console.error('Erreur chargement statut SumUp:', error);
      Alert.alert('Erreur', 'Impossible de charger le statut SumUp');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleConnect = async () => {
    setActionLoading('connect');
    try {
      const data = await api.getSumUpConnectUrl();
      if (data?.url) {
        await Linking.openURL(data.url);
      } else {
        Alert.alert('Erreur', 'Impossible de générer l\'URL de connexion SumUp');
      }
    } catch (error: any) {
      if (error?.status === 403) {
        Alert.alert(
          'Accès refusé',
          error?.message || permissionReason || 'Vous n\'avez pas les droits pour connecter SumUp.'
        );
      } else {
        Alert.alert('Erreur', error.message || 'Impossible de se connecter à SumUp');
      }
    } finally {
      setActionLoading(null);
    }
  };

  const handleDisconnect = async () => {
    Alert.alert(
      'Déconnecter SumUp',
      'Êtes-vous sûr de vouloir déconnecter votre compte SumUp ?\n\nLes liens de paiement existants continueront de fonctionner, mais les nouveaux devis/factures ne contiendront plus de lien de paiement.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Déconnecter',
          style: 'destructive',
          onPress: async () => {
            setActionLoading('disconnect');
            try {
              await api.disconnectSumUp();
              Alert.alert('Succès', 'Compte SumUp déconnecté');
              loadStatus();
            } catch (error: any) {
              Alert.alert('Erreur', error.message || 'Impossible de déconnecter SumUp');
            } finally {
              setActionLoading(null);
            }
          },
        },
      ]
    );
  };

  const formatDate = (date: string | null) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Text style={styles.backButtonText}>← Retour</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>SumUp</Text>
          <View style={{ width: 60 }} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Chargement...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Retour</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Paiement SumUp</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Bannière explicative */}
        <View style={styles.infoBanner}>
          <Text style={styles.infoBannerIcon}>💳</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.infoBannerTitle}>Paiement en ligne</Text>
            <Text style={styles.infoBannerText}>
              Connectez votre compte SumUp pour inclure automatiquement des liens de paiement dans vos devis et factures.
            </Text>
          </View>
        </View>

        {/* Pas les droits → Message d'information */}
        {!canManage && (
          <View style={styles.permissionCard}>
            <Text style={styles.permissionIcon}>🔒</Text>
            <Text style={styles.permissionTitle}>Accès restreint</Text>
            <Text style={styles.permissionText}>
              {permissionReason || 'Vous n\'avez pas les droits pour configurer SumUp.'}
            </Text>
            {connected && (
              <View style={styles.permissionStatusRow}>
                <View style={styles.connectedDot} />
                <Text style={styles.permissionStatusText}>
                  SumUp est configuré par votre entreprise
                </Text>
              </View>
            )}
          </View>
        )}

        {/* A les droits → Carte statut */}
        {canManage && (
          <>
            {/* Statut de connexion */}
            <View style={[
              styles.statusCard,
              connected ? styles.statusCardConnected : styles.statusCardDisconnected,
            ]}>
              <View style={styles.statusHeader}>
                <View style={[
                  styles.statusDot,
                  { backgroundColor: connected ? '#22c55e' : '#ef4444' },
                ]} />
                <Text style={[
                  styles.statusTitle,
                  { color: connected ? '#059669' : '#dc2626' },
                ]}>
                  {connected ? 'Connecté' : 'Non connecté'}
                </Text>
              </View>

              {connected && (
                <View style={styles.statusDetails}>
                  {merchantCode && (
                    <View style={styles.statusRow}>
                      <Text style={styles.statusLabel}>Merchant ID</Text>
                      <Text style={styles.statusValue}>{merchantCode}</Text>
                    </View>
                  )}
                  {merchantId && merchantId !== merchantCode && (
                    <View style={styles.statusRow}>
                      <Text style={styles.statusLabel}>Merchant Code</Text>
                      <Text style={styles.statusValue}>{merchantId}</Text>
                    </View>
                  )}
                  {connectedAt && (
                    <View style={styles.statusRow}>
                      <Text style={styles.statusLabel}>Connecté le</Text>
                      <Text style={styles.statusValue}>{formatDate(connectedAt)}</Text>
                    </View>
                  )}
                </View>
              )}

              {!connected && (
                <Text style={styles.statusDescription}>
                  Aucun compte SumUp n'est connecté. Les devis et factures seront envoyés sans lien de paiement.
                </Text>
              )}
            </View>

            {/* Actions */}
            <View style={styles.actionsCard}>
              {!connected ? (
                <TouchableOpacity
                  style={styles.connectButton}
                  onPress={handleConnect}
                  disabled={actionLoading !== null}
                >
                  {actionLoading === 'connect' ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <Text style={styles.connectButtonIcon}>🔗</Text>
                      <Text style={styles.connectButtonText}>Connecter SumUp</Text>
                    </>
                  )}
                </TouchableOpacity>
              ) : (
                <>
                  <TouchableOpacity
                    style={styles.reconnectButton}
                    onPress={handleConnect}
                    disabled={actionLoading !== null}
                  >
                    {actionLoading === 'connect' ? (
                      <ActivityIndicator color="#0ea5e9" size="small" />
                    ) : (
                      <>
                        <Text style={styles.reconnectButtonIcon}>🔄</Text>
                        <Text style={styles.reconnectButtonText}>Reconnecter</Text>
                      </>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.disconnectButton}
                    onPress={handleDisconnect}
                    disabled={actionLoading !== null}
                  >
                    {actionLoading === 'disconnect' ? (
                      <ActivityIndicator color="#dc2626" size="small" />
                    ) : (
                      <>
                        <Text style={styles.disconnectButtonIcon}>✕</Text>
                        <Text style={styles.disconnectButtonText}>Déconnecter</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </>
              )}
            </View>

            {/* Comment ça marche */}
            <View style={styles.helpCard}>
              <Text style={styles.helpTitle}>Comment ça marche ?</Text>
              <View style={styles.helpStep}>
                <Text style={styles.helpStepNumber}>1</Text>
                <Text style={styles.helpStepText}>
                  Cliquez sur "Connecter SumUp" pour autoriser Beatus
                </Text>
              </View>
              <View style={styles.helpStep}>
                <Text style={styles.helpStepNumber}>2</Text>
                <Text style={styles.helpStepText}>
                  Connectez-vous à votre compte SumUp
                </Text>
              </View>
              <View style={styles.helpStep}>
                <Text style={styles.helpStepNumber}>3</Text>
                <Text style={styles.helpStepText}>
                  Les devis et factures incluront automatiquement un lien de paiement
                </Text>
              </View>
              <View style={styles.helpStep}>
                <Text style={styles.helpStepNumber}>4</Text>
                <Text style={styles.helpStepText}>
                  Vos clients paient en ligne, vous êtes notifié
                </Text>
              </View>
            </View>
          </>
        )}
      </ScrollView>
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
    fontSize: 14,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#0ea5e9',
  },
  backButton: {
    padding: 4,
    minWidth: 60,
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
  // Bannière info
  infoBanner: {
    flexDirection: 'row',
    backgroundColor: '#eff6ff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  infoBannerIcon: {
    fontSize: 28,
  },
  infoBannerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e40af',
    marginBottom: 4,
  },
  infoBannerText: {
    fontSize: 13,
    color: '#3b82f6',
    lineHeight: 18,
  },
  // Permission refusée
  permissionCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 16,
  },
  permissionIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  permissionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8,
  },
  permissionText: {
    fontSize: 14,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
  },
  permissionStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#d1fae5',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  connectedDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#22c55e',
  },
  permissionStatusText: {
    fontSize: 13,
    color: '#059669',
    fontWeight: '500',
  },
  // Statut
  statusCard: {
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
  },
  statusCardConnected: {
    backgroundColor: '#f0fdf4',
    borderColor: '#bbf7d0',
  },
  statusCardDisconnected: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  statusTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  statusDescription: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 20,
  },
  statusDetails: {
    marginTop: 4,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  statusLabel: {
    fontSize: 14,
    color: '#6b7280',
  },
  statusValue: {
    fontSize: 14,
    color: COLORS.text,
    fontWeight: '500',
  },
  // Actions
  actionsCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 12,
  },
  connectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0ea5e9',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 10,
  },
  connectButtonIcon: {
    fontSize: 20,
  },
  connectButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
  reconnectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e0f2fe',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: '#7dd3fc',
  },
  reconnectButtonIcon: {
    fontSize: 16,
  },
  reconnectButtonText: {
    color: '#0369a1',
    fontSize: 15,
    fontWeight: '600',
  },
  disconnectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fef2f2',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  disconnectButtonIcon: {
    fontSize: 14,
    color: '#dc2626',
  },
  disconnectButtonText: {
    color: '#dc2626',
    fontSize: 15,
    fontWeight: '600',
  },
  // Help
  helpCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  helpTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 16,
  },
  helpStep: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 14,
  },
  helpStepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#0ea5e9',
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 28,
    overflow: 'hidden',
  },
  helpStepText: {
    flex: 1,
    fontSize: 14,
    color: COLORS.text,
    lineHeight: 20,
    paddingTop: 3,
  },
});
