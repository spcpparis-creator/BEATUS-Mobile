import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../services/api';
import { COLORS, STATUS_COLORS, STATUS_LABELS, TYPE_LABELS } from '../../config/api';
import * as Location from 'expo-location';

interface Intervention {
  id: string;
  type: string;
  status: string;
  clientName: string;
  clientAddress?: string;
  scheduledDate: string;
  description?: string;
  estimatedAmount?: number;
  // Adresse peut être un objet ou une chaîne
  address?: {
    street?: string;
    city?: string;
    postalCode?: string;
    fullAddress?: string;
  } | string;
  amountTTC?: number;
  amountRealized?: number;
  completedAt?: string;
}

// Helper pour extraire l'adresse affichable
const getDisplayAddress = (intervention: Intervention): string => {
  // Si clientAddress existe, l'utiliser
  if (intervention.clientAddress) {
    return intervention.clientAddress;
  }
  
  // Si address est un objet
  if (intervention.address && typeof intervention.address === 'object') {
    const addr = intervention.address;
    if (addr.fullAddress) return addr.fullAddress;
    
    const parts = [];
    if (addr.city) parts.push(addr.city);
    if (addr.postalCode) parts.push(`(${addr.postalCode})`);
    if (parts.length > 0) return parts.join(' ');
    
    if (addr.street) return addr.street;
  }
  
  // Si address est une chaîne
  if (typeof intervention.address === 'string') {
    return intervention.address;
  }
  
  return 'Adresse non renseignée';
};

export default function TechnicianHomeScreen({ navigation }: any) {
  const { user, logout } = useAuth();
  const [interventions, setInterventions] = useState<Intervention[]>([]);
  const [completedInterventions, setCompletedInterventions] = useState<Intervention[]>([]);
  const [stats, setStats] = useState({ today: 0, week: 0, pending: 0, revenue: 0, totalEarned: 0, commissionRate: 30 });
  const [refreshing, setRefreshing] = useState(false);
  const [isAvailable, setIsAvailable] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [technicianProfile, setTechnicianProfile] = useState<any>(null);

  const loadData = useCallback(async () => {
    try {
      // Charger le profil technicien et les interventions en parallèle
      const [profileData, availableData, assignedData, enRouteData, onSiteData, completedData, invoicedData, paidData] = await Promise.all([
        // Profil technicien pour obtenir le % de commission
        api.getTechnicianProfile().catch(() => null),
        // Interventions disponibles dans mon secteur (status pending/notified)
        api.getInterventions({ status: 'pending' }).catch(() => []),
        // Mes interventions acceptées
        api.getInterventions({ status: 'accepted' }).catch(() => []),
        // En route
        api.getInterventions({ status: 'en_route' }).catch(() => []),
        // Sur place
        api.getInterventions({ status: 'on_site' }).catch(() => []),
        // Historique (terminées)
        api.getInterventions({ status: 'completed' }).catch(() => []),
        // Historique (facturées)
        api.getInterventions({ status: 'invoiced' }).catch(() => []),
        // Historique (payées)
        api.getInterventions({ status: 'paid' }).catch(() => []),
      ]);
      
      // Récupérer le taux de commission du technicien (utiliser ?? pour gérer 0 correctement)
      const commissionRate = profileData?.commissionPercentage ?? profileData?.commission_percentage ?? 30;
      setTechnicianProfile(profileData);
      
      // Fusionner et dédupliquer par ID (sauf historique)
      const activeInterventions = [
        ...(availableData || []), 
        ...(assignedData || []),
        ...(enRouteData || []),
        ...(onSiteData || []),
      ];
      const seen = new Set<string>();
      const uniqueInterventions = activeInterventions.filter((i: any) => {
        if (seen.has(i.id)) return false;
        seen.add(i.id);
        return true;
      });
      
      setInterventions(uniqueInterventions);
      
      // Fusionner toutes les interventions d'historique (completed + invoiced + paid)
      const allHistoryInterventions = [
        ...(completedData || []),
        ...(invoicedData || []),
        ...(paidData || []),
      ];
      // Dédupliquer l'historique
      const seenHistory = new Set<string>();
      const uniqueHistory = allHistoryInterventions.filter((i: any) => {
        if (seenHistory.has(i.id)) return false;
        seenHistory.add(i.id);
        return true;
      });
      setCompletedInterventions(uniqueHistory);
      
      console.log(`[TechnicianHome] ${uniqueInterventions.length} actives, ${uniqueHistory.length} historique, commission: ${commissionRate}%`);
      
      // Calculer les stats
      const today = new Date().toDateString();
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      
      const allData = [...uniqueInterventions, ...uniqueHistory];
      
      const todayCount = allData.filter((i: any) => 
        i.scheduledDate && new Date(i.scheduledDate).toDateString() === today
      ).length;
      const weekCount = allData.filter((i: any) => 
        i.scheduledDate && new Date(i.scheduledDate) >= weekAgo
      ).length;
      const pendingCount = uniqueInterventions.filter((i: any) => 
        ['pending', 'notified', 'assigned', 'accepted'].includes(i.status)
      ).length;
      
      // Calculer les VRAIS gains du technicien (montant × commission%)
      const totalRevenue = uniqueHistory
        .reduce((sum: number, i: any) => sum + (parseFloat(i.amountTTC) || parseFloat(i.amountRealized) || 0), 0);
      const totalEarned = totalRevenue * (commissionRate / 100);
      
      setStats({ today: todayCount, week: weekCount, pending: pendingCount, revenue: totalRevenue, totalEarned, commissionRate });
    } catch (error) {
      console.error('Erreur chargement interventions:', error);
    }
  }, [user?.id]);

  useEffect(() => {
    loadData();
    startLocationTracking();
  }, [loadData]);

  const startLocationTracking = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission requise',
          'La géolocalisation est nécessaire pour le suivi en temps réel.'
        );
        return;
      }

      // Envoyer la position toutes les 30 secondes
      const updateLocation = async () => {
        try {
          const location = await Location.getCurrentPositionAsync({});
          await api.updateLocation(location.coords.latitude, location.coords.longitude);
        } catch (error) {
          console.error('Erreur mise à jour position:', error);
        }
      };

      updateLocation();
      const interval = setInterval(updateLocation, 30000);
      return () => clearInterval(interval);
    } catch (error) {
      console.error('Erreur géolocalisation:', error);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const toggleAvailability = async () => {
    try {
      await api.toggleAvailability(!isAvailable);
      setIsAvailable(!isAvailable);
    } catch (error) {
      Alert.alert('Erreur', 'Impossible de changer la disponibilité');
    }
  };

  const acceptIntervention = async (id: string) => {
    try {
      const location = await Location.getCurrentPositionAsync({});
      await api.acceptIntervention(id, {
        lat: location.coords.latitude,
        lng: location.coords.longitude,
      });
      // Naviguer vers le détail pour le suivi
      navigation.navigate('InterventionDetail', { interventionId: id });
      loadData();
    } catch (error: any) {
      Alert.alert('Erreur', error.message || 'Impossible d\'accepter l\'intervention');
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
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

  const pendingInterventions = interventions.filter(i => 
    ['pending', 'assigned', 'notified'].includes(i.status)
  );
  // Interventions en cours (acceptées ou en progression)
  const activeInterventions = interventions.filter(i => 
    ['accepted', 'en_route', 'on_site', 'in_progress'].includes(i.status)
  );

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.greeting}>Bonjour,</Text>
            <Text style={styles.userName}>{user?.name || 'Technicien'}</Text>
          </View>
          <TouchableOpacity
            style={[styles.availabilityBadge, !isAvailable && styles.unavailableBadge]}
            onPress={toggleAvailability}
          >
            <View style={[styles.availabilityDot, !isAvailable && styles.unavailableDot]} />
            <Text style={[styles.availabilityText, !isAvailable && styles.unavailableText]}>
              {isAvailable ? 'Disponible' : 'Indisponible'}
            </Text>
          </TouchableOpacity>
        </View>
        
        {/* Commission Badge */}
        <View style={styles.commissionBanner}>
          <Text style={styles.commissionIcon}>💰</Text>
          <View style={styles.commissionInfo}>
            <Text style={styles.commissionLabel}>Ma commission</Text>
            <Text style={styles.commissionValue}>{stats.commissionRate}%</Text>
          </View>
          <Text style={styles.commissionHint}>sur chaque intervention</Text>
        </View>
      </View>

      {/* Stats */}
      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{stats.today}</Text>
          <Text style={styles.statLabel}>Aujourd'hui</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{stats.week}</Text>
          <Text style={styles.statLabel}>Cette semaine</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{stats.pending}</Text>
          <Text style={styles.statLabel}>En attente</Text>
        </View>
        <View style={[styles.statCard, styles.revenueCard]}>
          <Text style={[styles.statNumber, styles.revenueNumber]}>
            {formatCurrency(stats.totalEarned)}
          </Text>
          <Text style={styles.statLabel}>💰 Mes gains</Text>
          <Text style={styles.statSublabel}>{stats.commissionRate}% commission</Text>
        </View>
      </View>

      {/* Nouvelles interventions */}
      {pendingInterventions.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🔔 Nouvelles interventions</Text>
          {pendingInterventions.map((intervention) => (
            <TouchableOpacity 
              key={intervention.id} 
              style={styles.interventionCard}
              onPress={() => navigation.navigate('InterventionDetail', { interventionId: intervention.id })}
            >
              <View style={styles.interventionHeader}>
                <View style={[styles.typeBadge, { backgroundColor: STATUS_COLORS[intervention.status] + '20' }]}>
                  <Text style={[styles.typeBadgeText, { color: STATUS_COLORS[intervention.status] }]}>
                    {TYPE_LABELS[intervention.type] || intervention.type}
                  </Text>
                </View>
                <Text style={styles.interventionDate}>{formatDate(intervention.scheduledDate)}</Text>
              </View>
              {/* Pas de nom client avant acceptation (pending/notified) */}
              <View style={styles.addressRow}>
                <Text style={styles.addressIcon}>📍</Text>
                <Text style={styles.addressText}>{getDisplayAddress(intervention)}</Text>
              </View>
              {intervention.description && (
                <Text style={styles.description} numberOfLines={2}>
                  {intervention.description}
                </Text>
              )}
              {intervention.estimatedAmount && (
                <Text style={styles.amount}>
                  Montant estimé: {formatCurrency(intervention.estimatedAmount)}
                </Text>
              )}
              <View style={styles.actionButtons}>
                <TouchableOpacity
                  style={styles.acceptButton}
                  onPress={(e) => {
                    e.stopPropagation();
                    acceptIntervention(intervention.id);
                  }}
                >
                  <Text style={styles.acceptButtonText}>✓ Accepter</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.declineButton}
                  onPress={(e) => {
                    e.stopPropagation();
                    // TODO: Handle decline
                  }}
                >
                  <Text style={styles.declineButtonText}>✕ Refuser</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Interventions en cours */}
      {activeInterventions.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>⚡ Mes interventions en cours</Text>
          {activeInterventions.map((intervention) => {
            // Mini barre de progression
            const step = intervention.status === 'accepted' ? 1 
              : intervention.status === 'en_route' ? 2 
              : ['on_site', 'in_progress'].includes(intervention.status) ? 3 : 0;
            
            return (
              <TouchableOpacity 
                key={intervention.id} 
                style={[styles.interventionCard, styles.activeCard]}
                onPress={() => navigation.navigate('InterventionDetail', { interventionId: intervention.id })}
              >
                {/* Mini barre de progression */}
                <View style={styles.miniProgressBar}>
                  <View style={[styles.miniProgressStep, step >= 1 && styles.miniProgressStepActive]}>
                    <Text style={styles.miniProgressIcon}>✓</Text>
                  </View>
                  <View style={[styles.miniProgressLine, step >= 2 && styles.miniProgressLineActive]} />
                  <View style={[styles.miniProgressStep, step >= 2 && styles.miniProgressStepActive]}>
                    <Text style={styles.miniProgressIcon}>🚗</Text>
                  </View>
                  <View style={[styles.miniProgressLine, step >= 3 && styles.miniProgressLineActive]} />
                  <View style={[styles.miniProgressStep, step >= 3 && styles.miniProgressStepActive]}>
                    <Text style={styles.miniProgressIcon}>📍</Text>
                  </View>
                </View>
                
                <View style={styles.interventionHeader}>
                  <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[intervention.status] }]}>
                    <Text style={styles.statusBadgeText}>
                      {STATUS_LABELS[intervention.status]}
                    </Text>
                  </View>
                  <Text style={styles.interventionDate}>{formatDate(intervention.scheduledDate)}</Text>
                </View>
                <Text style={styles.clientName}>{intervention.clientName || intervention.client?.name || 'Client'}</Text>
                <View style={styles.addressRow}>
                  <Text style={styles.addressIcon}>📍</Text>
                  <Text style={styles.addressText}>{getDisplayAddress(intervention)}</Text>
                </View>
                <TouchableOpacity 
                  style={[styles.detailsButton, styles.continueButton]}
                  onPress={() => navigation.navigate('InterventionDetail', { interventionId: intervention.id })}
                >
                  <Text style={[styles.detailsButtonText, styles.continueButtonText]}>
                    {intervention.status === 'accepted' ? '🚗 Démarrer le trajet' : 
                     intervention.status === 'en_route' ? '📍 Je suis arrivé' :
                     '✓ Terminer l\'intervention'}
                  </Text>
                </TouchableOpacity>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* État vide */}
      {interventions.length === 0 && !completedInterventions.length && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>📋</Text>
          <Text style={styles.emptyTitle}>Aucune intervention</Text>
          <Text style={styles.emptySubtitle}>
            Vos interventions apparaîtront ici
          </Text>
        </View>
      )}

      {/* Historique des interventions */}
      {completedInterventions.length > 0 && (
        <View style={styles.section}>
          <TouchableOpacity 
            style={styles.historyHeader}
            onPress={() => setShowHistory(!showHistory)}
          >
            <Text style={styles.sectionTitle}>📜 Historique ({completedInterventions.length})</Text>
            <Text style={styles.historyToggle}>{showHistory ? '▲' : '▼'}</Text>
          </TouchableOpacity>
          
          {showHistory && (
            <>
              {/* Résumé des gains */}
              <View style={styles.earningsCard}>
                <Text style={styles.earningsTitle}>💰 Total gagné ({stats.commissionRate}% commission)</Text>
                <Text style={styles.earningsAmount}>{formatCurrency(stats.totalEarned)}</Text>
                <Text style={styles.earningsCount}>
                  {completedInterventions.length} intervention(s) • CA total: {formatCurrency(stats.revenue)}
                </Text>
              </View>
              
              {/* Liste des interventions terminées */}
              {completedInterventions.slice(0, 10).map((intervention) => {
                const interventionAmount = intervention.amountTTC || intervention.amountRealized || 0;
                const myEarnings = interventionAmount * (stats.commissionRate / 100);
                
                return (
                  <TouchableOpacity 
                    key={intervention.id} 
                    style={[styles.interventionCard, styles.completedCard]}
                    onPress={() => navigation.navigate('InterventionDetail', { interventionId: intervention.id })}
                  >
                    <View style={styles.interventionHeader}>
                      <View style={[styles.statusBadge, { backgroundColor: '#10b981' }]}>
                        <Text style={styles.statusBadgeText}>✓ Terminée</Text>
                      </View>
                      <Text style={styles.interventionDate}>
                        {intervention.completedAt ? formatDate(intervention.completedAt) : formatDate(intervention.scheduledDate)}
                      </Text>
                    </View>
                    <Text style={styles.clientName}>{intervention.clientName || intervention.client?.name || 'Client'}</Text>
                    <View style={styles.addressRow}>
                      <Text style={styles.addressIcon}>📍</Text>
                      <Text style={styles.addressText}>{getDisplayAddress(intervention)}</Text>
                    </View>
                    <View style={styles.earningsRow}>
                      <View>
                        <Text style={styles.earningsLabel}>Montant intervention</Text>
                        <Text style={styles.interventionTotal}>{formatCurrency(interventionAmount)}</Text>
                      </View>
                      <View style={styles.myEarningsBox}>
                        <Text style={styles.earningsLabel}>Mon gain ({stats.commissionRate}%)</Text>
                        <Text style={styles.interventionEarnings}>{formatCurrency(myEarnings)}</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
              
              {completedInterventions.length > 10 && (
                <Text style={styles.moreText}>+ {completedInterventions.length - 10} autres interventions</Text>
              )}
            </>
          )}
        </View>
      )}

      {/* Bouton déconnexion */}
      <TouchableOpacity style={styles.logoutButton} onPress={logout}>
        <Text style={styles.logoutText}>Se déconnecter</Text>
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    backgroundColor: COLORS.primary,
    paddingTop: 60,
    paddingBottom: 24,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  greeting: {
    fontSize: 16,
    color: '#bfdbfe',
  },
  userName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 4,
  },
  commissionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  commissionIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  commissionInfo: {
    flex: 1,
  },
  commissionLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
  },
  commissionValue: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
  },
  commissionHint: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'right',
    maxWidth: 80,
  },
  availabilityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  unavailableBadge: {
    backgroundColor: 'rgba(239,68,68,0.2)',
  },
  availabilityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4ade80',
    marginRight: 6,
  },
  unavailableDot: {
    backgroundColor: '#ef4444',
  },
  availabilityText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
  },
  unavailableText: {
    color: '#fecaca',
  },
  statsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    marginTop: -20,
    gap: 12,
  },
  statCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  revenueCard: {
    backgroundColor: '#ecfdf5',
  },
  statNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  revenueNumber: {
    color: '#059669',
    fontSize: 18,
  },
  statLabel: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 4,
  },
  statSublabel: {
    fontSize: 10,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  section: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 16,
  },
  interventionCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  activeCard: {
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary,
  },
  interventionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  typeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  typeBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  interventionDate: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  clientName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  addressIcon: {
    marginRight: 6,
  },
  addressText: {
    flex: 1,
    fontSize: 14,
    color: COLORS.textMuted,
    lineHeight: 20,
  },
  description: {
    fontSize: 14,
    color: COLORS.textMuted,
    marginTop: 8,
    fontStyle: 'italic',
  },
  amount: {
    fontSize: 14,
    color: COLORS.success,
    fontWeight: '500',
    marginTop: 8,
  },
  actionButtons: {
    flexDirection: 'row',
    marginTop: 16,
    gap: 12,
  },
  acceptButton: {
    flex: 1,
    backgroundColor: COLORS.success,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  acceptButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  declineButton: {
    flex: 1,
    backgroundColor: '#fee2e2',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  declineButtonText: {
    color: COLORS.danger,
    fontWeight: '600',
    fontSize: 14,
  },
  detailsButton: {
    marginTop: 12,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    borderRadius: 10,
  },
  detailsButtonText: {
    color: COLORS.primary,
    fontWeight: '600',
    fontSize: 14,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: COLORS.textMuted,
  },
  logoutButton: {
    marginHorizontal: 20,
    marginTop: 20,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#fee2e2',
    alignItems: 'center',
  },
  logoutText: {
    color: COLORS.danger,
    fontSize: 16,
    fontWeight: '600',
  },
  // Mini barre de progression pour les interventions en cours
  miniProgressBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    paddingVertical: 8,
    backgroundColor: '#f8fafc',
    borderRadius: 10,
  },
  miniProgressStep: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#e5e7eb',
    justifyContent: 'center',
    alignItems: 'center',
  },
  miniProgressStepActive: {
    backgroundColor: COLORS.success,
  },
  miniProgressIcon: {
    fontSize: 14,
  },
  miniProgressLine: {
    width: 40,
    height: 3,
    backgroundColor: '#e5e7eb',
  },
  miniProgressLineActive: {
    backgroundColor: COLORS.success,
  },
  continueButton: {
    backgroundColor: COLORS.primary,
  },
  continueButtonText: {
    color: '#fff',
  },
  // Styles pour l'historique
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  historyToggle: {
    fontSize: 14,
    color: COLORS.textMuted,
  },
  earningsCard: {
    backgroundColor: '#ecfdf5',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  earningsTitle: {
    fontSize: 14,
    color: '#065f46',
    marginBottom: 8,
  },
  earningsAmount: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#059669',
  },
  earningsCount: {
    fontSize: 12,
    color: '#065f46',
    marginTop: 4,
  },
  completedCard: {
    borderLeftWidth: 4,
    borderLeftColor: '#10b981',
    opacity: 0.9,
  },
  earningsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  earningsLabel: {
    fontSize: 11,
    color: COLORS.textMuted,
  },
  interventionTotal: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  myEarningsBox: {
    alignItems: 'flex-end',
    backgroundColor: '#ecfdf5',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  interventionEarnings: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#059669',
  },
  moreText: {
    textAlign: 'center',
    color: COLORS.textMuted,
    fontSize: 14,
    marginTop: 8,
  },
});
