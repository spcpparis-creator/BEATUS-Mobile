import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
  Linking,
  Platform,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../services/api';
import { COLORS, STATUS_COLORS, STATUS_LABELS, TYPE_LABELS } from '../../config/api';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { Image, TextInput, KeyboardAvoidingView } from 'react-native';

const BACKGROUND_LOCATION_TASK = 'background-location-task';

let TaskManager: any = null;
try {
  TaskManager = require('expo-task-manager');
  TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }: any) => {
    if (error) { return; }
    if (data) {
      const { locations } = data as { locations: Location.LocationObject[] };
      const loc = locations?.[0];
      if (loc) {
        try { await api.updateLocation(loc.coords.latitude, loc.coords.longitude); } catch {}
      }
    }
  });
} catch {
  console.log('[Location] expo-task-manager non disponible (Expo Go), fallback setInterval');
}

interface Intervention {
  id: string;
  type: string;
  status: string;
  clientName: string;
  clientPhone?: string;
  clientAddress?: string;
  client?: { name?: string; phone?: string };
  scheduledDate?: string;
  scheduledAt?: string;
  description?: string;
  estimatedAmount?: number;
  address?: {
    street?: string;
    city?: string;
    postalCode?: string;
    fullAddress?: string;
  } | string;
  amountTTC?: number;
  amountRealized?: number;
  completedAt?: string;
  reference?: string;
  [key: string]: any;
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
    if (addr.street) parts.push(addr.street);
    if (addr.postalCode || addr.city) {
      parts.push([addr.postalCode, addr.city].filter(Boolean).join(' '));
    }
    if (parts.length > 0) return parts.join(', ');
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
  const [stats, setStats] = useState({ today: 0, week: 0, pending: 0, revenue: 0, totalEarned: 0, commissionRate: 30, totalToReceive: 0, totalReceived: 0 });
  const [refreshing, setRefreshing] = useState(false);
  const [isAvailable, setIsAvailable] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [technicianProfile, setTechnicianProfile] = useState<any>(null);
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);
  const [mainView, setMainView] = useState<'home' | 'interventions' | 'profile'>('home');

  // Modale d'annulation intervention
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancellingInterventionId, setCancellingInterventionId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [selectedCancelReason, setSelectedCancelReason] = useState<string | null>(null);
  const CANCEL_REASONS = [
    'Client ne répond pas',
    'Client annule',
    'Adresse introuvable',
    'Problème technique',
    'Doublon d\'intervention',
  ];

  // Modale de complétion d'intervention
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [completingInterventionId, setCompletingInterventionId] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
  const [cFinalAmount, setCFinalAmount] = useState('');
  const [cMaterialCost, setCMaterialCost] = useState('');
  const [cTimeSpent, setCTimeSpent] = useState('');
  const [cDescription, setCDescription] = useState('');
  const [cNotes, setCNotes] = useState('');
  const [cPhotos, setCPhotos] = useState<string[]>([]);

  const handleOpenCompleteModal = (interventionId: string) => {
    setCompletingInterventionId(interventionId);
    setCFinalAmount('');
    setCMaterialCost('');
    setCTimeSpent('');
    setCDescription('');
    setCNotes('');
    setCPhotos([]);
    setShowCompleteModal(true);
  };

  const handleCompleteIntervention = async () => {
    if (!completingInterventionId || !cFinalAmount || parseFloat(cFinalAmount) <= 0) {
      Alert.alert('Erreur', 'Veuillez entrer un montant final valide');
      return;
    }
    setCompleting(true);
    try {
      let location: { lat: number; lng: number } | undefined;
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({});
          location = { lat: loc.coords.latitude, lng: loc.coords.longitude };
        }
      } catch {}

      const completionData: any = {
        amountTTC: parseFloat(cFinalAmount),
        amountRealized: parseFloat(cFinalAmount),
        notes: cNotes || undefined,
        description: cDescription || undefined,
        completedAt: new Date().toISOString(),
        location,
      };
      if (cMaterialCost) {
        completionData.materialCost = parseFloat(cMaterialCost);
        completionData.materialCostSelf = parseFloat(cMaterialCost);
      }
      if (cTimeSpent) completionData.timeSpent = parseFloat(cTimeSpent);
      if (cPhotos.length > 0) completionData.photos = cPhotos;

      await api.completeIntervention(completingInterventionId, completionData);
      setShowCompleteModal(false);
      setCompletingInterventionId(null);
      const amt = parseFloat(cFinalAmount);
      const mat = parseFloat(cMaterialCost) || 0;
      Alert.alert('Intervention terminée !', `Montant : ${amt.toFixed(2)} €${mat > 0 ? `\nMatériel : ${mat.toFixed(2)} €` : ''}${cPhotos.length > 0 ? `\n${cPhotos.length} photo(s)` : ''}`);
      loadData();
    } catch (error: any) {
      Alert.alert('Erreur', error.message || 'Impossible de terminer l\'intervention');
    } finally {
      setCompleting(false);
    }
  };

  const cTakePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission requise', 'Accès caméra nécessaire.'); return; }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (!result.canceled && result.assets[0]) setCPhotos(prev => [...prev, result.assets[0].uri]);
  };

  const cPickPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7, allowsMultipleSelection: true, selectionLimit: 5 });
    if (!result.canceled && result.assets.length > 0) setCPhotos(prev => [...prev, ...result.assets.map(a => a.uri)]);
  };

  const handleOpenCancelModal = (interventionId: string) => {
    setCancellingInterventionId(interventionId);
    setSelectedCancelReason(null);
    setShowCancelModal(true);
  };

  const handleCancelIntervention = async () => {
    if (!cancellingInterventionId || !selectedCancelReason) return;
    setCancelling(true);
    try {
      await api.cancelIntervention(cancellingInterventionId, selectedCancelReason);
      setShowCancelModal(false);
      setCancellingInterventionId(null);
      setSelectedCancelReason(null);
      Alert.alert('Intervention annulée', 'L\'intervention a été annulée avec succès.');
      loadData();
    } catch (error: any) {
      Alert.alert('Erreur', error.message || 'Impossible d\'annuler l\'intervention');
    } finally {
      setCancelling(false);
    }
  };

  const loadData = useCallback(async () => {
    try {
      // Charger le profil technicien et les interventions en parallèle
      const [profileData, availableData, assignedData, enRouteData, onSiteData, completedData, invoicedData, paidData] = await Promise.all([
        // Profil technicien pour obtenir le % de commission
        api.getTechnicianProfile().catch(() => null),
        // Interventions disponibles dans mon secteur (status pending/notified)
        api.getInterventions({ status: ['pending', 'notified'] }).catch(() => []),
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
      
      const getDate = (i: any) => i.scheduledAt || i.scheduledDate || i.scheduled_at;
      const todayCount = allData.filter((i: any) => {
        const d = getDate(i);
        return d && new Date(d).toDateString() === today;
      }).length;
      const weekCount = allData.filter((i: any) => {
        const d = getDate(i);
        return d && new Date(d) >= weekAgo;
      }).length;
      const pendingCount = uniqueInterventions.filter((i: any) => {
        if (!['pending', 'notified', 'assigned', 'accepted'].includes(i.status)) return false;
        const declined: string[] = i.declinedBy || i.declined_by || [];
        if (user?.id && declined.includes(user.id)) return false;
        return true;
      }).length;
      
      // Calculer les VRAIS gains du technicien (montant × commission%)
      const totalRevenue = uniqueHistory
        .reduce((sum: number, i: any) => {
          const amt = parseFloat(i.amountTTC) || parseFloat(i.amount_ttc) || parseFloat(i.amountTtc) || parseFloat(i.amountRealized) || parseFloat(i.amount_realized) || 0;
          return sum + (isNaN(amt) ? 0 : amt);
        }, 0);
      const totalEarned = totalRevenue * (commissionRate / 100);

      // Calcul À recevoir / Déjà reçu (basé sur reversalStatus)
      let totalToReceive = 0;
      let totalReceived = 0;
      uniqueHistory.forEach((i: any) => {
        const amt = parseFloat(i.amountTTC) || parseFloat(i.amount_ttc) || parseFloat(i.amountRealized) || parseFloat(i.amount_realized) || 0;
        const earned = amt * (commissionRate / 100);
        const rStatus = i.reversalStatus || i.reversal_status;
        if (rStatus === 'paid') {
          totalReceived += earned;
        } else {
          totalToReceive += earned;
        }
      });

      setStats({ today: todayCount, week: weekCount, pending: pendingCount, revenue: totalRevenue, totalEarned, commissionRate, totalToReceive, totalReceived });

      // Charger le nombre de messages non lus
      const unreadCount = await api.getUnreadMessagesCount();
      setUnreadMessagesCount(unreadCount);
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
      const { status: fg } = await Location.requestForegroundPermissionsAsync();
      if (fg !== 'granted') {
        Alert.alert('Permission requise', 'La géolocalisation est nécessaire pour le suivi en temps réel.');
        return;
      }

      // Envoi immédiat de la position
      try {
        const loc = await Location.getCurrentPositionAsync({});
        await api.updateLocation(loc.coords.latitude, loc.coords.longitude);
      } catch {}

      // Tracking arrière-plan uniquement si TaskManager est disponible (build natif, pas Expo Go)
      if (TaskManager) {
        try {
          const { status: bg } = await Location.requestBackgroundPermissionsAsync();
          if (bg === 'granted') {
            const isStarted = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK).catch(() => false);
            if (!isStarted) {
              await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
                accuracy: Location.Accuracy.Balanced,
                timeInterval: 30000,
                distanceInterval: 50,
                deferredUpdatesInterval: 30000,
                foregroundService: {
                  notificationTitle: 'BEATUS — Suivi actif',
                  notificationBody: 'Votre position est partagée pour le suivi de l\'intervention.',
                  notificationColor: '#2563eb',
                },
                showsBackgroundLocationIndicator: true,
              });
              console.log('[Location] Tracking arrière-plan démarré');
            }
          }
        } catch (e) {
          console.warn('[Location] BG tracking non disponible:', e);
        }
      }

      // Polling au premier plan (toujours actif)
      const interval = setInterval(async () => {
        try {
          const loc = await Location.getCurrentPositionAsync({});
          await api.updateLocation(loc.coords.latitude, loc.coords.longitude);
        } catch {}
      }, 30000);
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
      await loadData();
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

  const pendingInterventions = interventions.filter(i => {
    if (!['pending', 'assigned', 'notified'].includes(i.status)) return false;
    const declined: string[] = (i as any).declinedBy || (i as any).declined_by || [];
    if (user?.id && declined.includes(user.id)) return false;
    return true;
  });
  // Interventions en cours (acceptées ou en progression)
  const activeInterventions = interventions.filter(i => 
    ['accepted', 'en_route', 'on_site', 'in_progress'].includes(i.status)
  );

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
    {mainView === 'home' && (
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
          <View style={styles.headerRightActions}>
            <TouchableOpacity
              style={styles.settingsButton}
              onPress={() => navigation.navigate('Messaging')}
            >
              <Text style={styles.settingsButtonText}>💬</Text>
              {unreadMessagesCount > 0 && (
                <View style={styles.messageBadge}>
                  <Text style={styles.messageBadgeText}>
                    {unreadMessagesCount > 99 ? '99+' : unreadMessagesCount}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.settingsButton}
              onPress={() => navigation.navigate('TechnicianSettings')}
            >
              <Text style={styles.settingsButtonText}>⚙️</Text>
            </TouchableOpacity>
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

      {/* Bilan financier */}
      <View style={{ marginHorizontal: 16, marginTop: 16 }}>
        <Text style={{ fontSize: 16, fontWeight: '700', color: '#1e293b', marginBottom: 12 }}>💳 Bilan financier</Text>
        <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 }}>
            <Text style={{ fontSize: 14, color: '#64748b' }}>Chiffre d'affaires total</Text>
            <Text style={{ fontSize: 16, fontWeight: '600', color: '#1e293b' }}>{formatCurrency(stats.revenue)}</Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 }}>
            <Text style={{ fontSize: 14, color: '#64748b' }}>Ma commission ({stats.commissionRate}%)</Text>
            <Text style={{ fontSize: 16, fontWeight: '600', color: '#059669' }}>{formatCurrency(stats.totalEarned)}</Text>
          </View>
          <View style={{ borderTopWidth: 1, borderTopColor: '#e2e8f0', marginTop: 8, paddingTop: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#1e293b' }}>À recevoir</Text>
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#059669' }}>{formatCurrency(stats.totalToReceive)}</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#1e293b' }}>Déjà reçu</Text>
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#94a3b8' }}>{formatCurrency(stats.totalReceived)}</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Accès rapide */}
      <TouchableOpacity
        style={styles.documentsShortcut}
        onPress={() => navigation.navigate('MyDocuments')}
      >
        <View style={styles.documentsShortcutLeft}>
          <Text style={styles.documentsShortcutIcon}>📋</Text>
          <View>
            <Text style={styles.documentsShortcutTitle}>Mes devis & factures</Text>
            <Text style={styles.documentsShortcutSubtitle}>Historique de vos documents</Text>
          </View>
        </View>
        <Text style={styles.documentsShortcutArrow}>›</Text>
      </TouchableOpacity>

      {/* Nouvelles interventions */}
      {pendingInterventions.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🔔 Nouvelles interventions</Text>
          {pendingInterventions.map((intervention) => (
            <View 
              key={intervention.id} 
              style={styles.interventionCard}
            >
              <View style={styles.interventionHeader}>
                <View style={[styles.typeBadge, { backgroundColor: STATUS_COLORS[intervention.status] + '20' }]}>
                  <Text style={[styles.typeBadgeText, { color: STATUS_COLORS[intervention.status] }]}>
                    {TYPE_LABELS[intervention.type] || intervention.type}
                  </Text>
                </View>
                <Text style={styles.interventionDate}>{formatDate(intervention.scheduledAt || intervention.scheduledDate || intervention.scheduled_at)}</Text>
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
                    Alert.alert(
                      'Refuser l\'intervention',
                      'Cette intervention ne sera plus visible pour vous mais restera disponible pour votre chef d\'équipe.',
                      [
                        { text: 'Annuler', style: 'cancel' },
                        {
                          text: 'Refuser',
                          style: 'destructive',
                          onPress: async () => {
                            try {
                              await api.declineIntervention(intervention.id);
                              loadData();
                            } catch (error: any) {
                              Alert.alert('Erreur', error.message || 'Impossible de refuser');
                            }
                          },
                        },
                      ]
                    );
                  }}
                >
                  <Text style={styles.declineButtonText}>✕ Refuser</Text>
                </TouchableOpacity>
              </View>
            </View>
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
              <View key={intervention.id} style={[styles.interventionCard, styles.activeCard]}>
                <View>
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
                    <Text style={styles.interventionDate}>{formatDate(intervention.scheduledAt || intervention.scheduledDate || intervention.scheduled_at)}</Text>
                  </View>
                  <Text style={styles.clientName}>{intervention.clientName || intervention.client?.name || 'Client'}</Text>
                  <View style={styles.addressRow}>
                    <Text style={styles.addressIcon}>📍</Text>
                    <Text style={styles.addressText}>{getDisplayAddress(intervention)}</Text>
                  </View>
                </View>

                {/* Actions rapides */}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10, marginBottom: 10 }}>
                  {(intervention.clientPhone || intervention.client?.phone) ? (
                    <TouchableOpacity
                      onPress={() => Linking.openURL(`tel:${intervention.clientPhone || intervention.client?.phone}`)}
                      style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8, borderRadius: 8, backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#bbf7d0' }}
                    >
                      <Text style={{ fontSize: 14 }}>📞</Text>
                      <Text style={{ fontSize: 11, fontWeight: '600', color: '#059669' }}>Appeler</Text>
                    </TouchableOpacity>
                  ) : null}
                  {intervention.address && typeof intervention.address === 'object' && intervention.address.street ? (
                    <TouchableOpacity
                      onPress={() => {
                        const a = intervention.address as { street?: string; postalCode?: string; city?: string };
                        const addr = `${a.street || ''}, ${a.postalCode || ''} ${a.city || ''}`.trim();
                        const encoded = encodeURIComponent(addr);
                        const startNavAndRoute = (url: string) => {
                          Linking.openURL(url);
                          api.updateInterventionStatus(intervention.id, 'en_route').then(() => loadData()).catch(() => {});
                        };
                        Alert.alert('Naviguer vers le client', addr, [
                          { text: 'Waze', onPress: () => startNavAndRoute(`https://waze.com/ul?q=${encoded}&navigate=yes`) },
                          { text: 'Plans', onPress: () => startNavAndRoute(Platform.OS === 'ios' ? `maps:?daddr=${encoded}` : `geo:0,0?q=${encoded}`) },
                          { text: 'Google Maps', onPress: () => startNavAndRoute(`https://www.google.com/maps/search/?api=1&query=${encoded}`) },
                          { text: 'Annuler', style: 'cancel' },
                        ]);
                      }}
                      style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8, borderRadius: 8, backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe' }}
                    >
                      <Text style={{ fontSize: 14 }}>🗺️</Text>
                      <Text style={{ fontSize: 11, fontWeight: '600', color: '#2563eb' }}>Naviguer</Text>
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity
                    onPress={() => handleOpenCancelModal(intervention.id)}
                    style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8, borderRadius: 8, backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca' }}
                  >
                    <Text style={{ fontSize: 14 }}>❌</Text>
                    <Text style={{ fontSize: 11, fontWeight: '600', color: '#dc2626' }}>Annuler</Text>
                  </TouchableOpacity>
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                  <TouchableOpacity
                    onPress={() => navigation.navigate('CreateQuote', { interventionId: intervention.id, intervention })}
                    style={{ flex: 1, minWidth: '40%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8, borderRadius: 8, backgroundColor: '#fefce8', borderWidth: 1, borderColor: '#fde68a' }}
                  >
                    <Text style={{ fontSize: 14 }}>📄</Text>
                    <Text style={{ fontSize: 11, fontWeight: '600', color: '#a16207' }}>Devis</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => navigation.navigate('CreateInvoice', { interventionId: intervention.id, intervention })}
                    style={{ flex: 1, minWidth: '40%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8, borderRadius: 8, backgroundColor: '#faf5ff', borderWidth: 1, borderColor: '#e9d5ff' }}
                  >
                    <Text style={{ fontSize: 14 }}>🧾</Text>
                    <Text style={{ fontSize: 11, fontWeight: '600', color: '#7c3aed' }}>Facture</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => navigation.navigate('Messaging', { interventionId: intervention.id, interventionRef: intervention.reference })}
                    style={{ flex: 1, minWidth: '40%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8, borderRadius: 8, backgroundColor: '#ecfdf5', borderWidth: 1, borderColor: '#a7f3d0' }}
                  >
                    <Text style={{ fontSize: 14 }}>💬</Text>
                    <Text style={{ fontSize: 11, fontWeight: '600', color: '#059669' }}>Message</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => navigation.navigate('MyDocuments', { interventionId: intervention.id })}
                    style={{ flex: 1, minWidth: '40%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8, borderRadius: 8, backgroundColor: '#f0f9ff', borderWidth: 1, borderColor: '#bae6fd' }}
                  >
                    <Text style={{ fontSize: 14 }}>📋</Text>
                    <Text style={{ fontSize: 11, fontWeight: '600', color: '#0284c7' }}>Voir docs</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity 
                  style={[styles.detailsButton, styles.continueButton, ['on_site', 'in_progress'].includes(intervention.status) && { backgroundColor: '#059669' }]}
                  onPress={async () => {
                    if (['on_site', 'in_progress'].includes(intervention.status)) {
                      handleOpenCompleteModal(intervention.id);
                    } else if (intervention.status === 'accepted') {
                      try {
                        await api.updateInterventionStatus(intervention.id, 'en_route');
                        loadData();
                      } catch (e) { Alert.alert('Erreur', 'Impossible de démarrer le trajet'); }
                    } else if (intervention.status === 'en_route') {
                      try {
                        await api.updateInterventionStatus(intervention.id, 'on_site');
                        loadData();
                      } catch (e) { Alert.alert('Erreur', 'Impossible de mettre à jour le statut'); }
                    }
                  }}
                >
                  <Text style={[styles.detailsButtonText, styles.continueButtonText]}>
                    {intervention.status === 'accepted' ? '🚗 Démarrer le trajet' : 
                     intervention.status === 'en_route' ? '📍 Je suis arrivé' :
                     '✓ Terminer l\'intervention'}
                  </Text>
                </TouchableOpacity>
              </View>
            );
          })}
        </View>
      )}

      {/* État vide */}
      {interventions.length === 0 && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>📋</Text>
          <Text style={styles.emptyTitle}>Aucune intervention active</Text>
          <Text style={styles.emptySubtitle}>
            Les nouvelles interventions apparaîtront ici
          </Text>
        </View>
      )}

      <View style={{ height: 100 }} />
    </ScrollView>
    )}

    {/* ===== VUE MES INTERVENTIONS ===== */}
    {mainView === 'interventions' && (
      <ScrollView
        style={styles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} />
        }
      >
        <View style={{ padding: 16, paddingTop: 60 }}>
          <Text style={{ fontSize: 22, fontWeight: 'bold', color: COLORS.text, marginBottom: 16 }}>Mes interventions</Text>
          {interventions.length === 0 && completedInterventions.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 40 }}>
              <Text style={{ fontSize: 48, marginBottom: 12 }}>📋</Text>
              <Text style={{ fontSize: 16, fontWeight: '600', color: COLORS.text }}>Aucune intervention</Text>
              <Text style={{ fontSize: 13, color: COLORS.textMuted, marginTop: 4 }}>Vos interventions apparaîtront ici</Text>
            </View>
          ) : (
            [...interventions, ...completedInterventions].filter(i => i.status !== 'cancelled').map((intervention) => (
              <TouchableOpacity
                key={intervention.id}
                style={{ backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: COLORS.border }}
                onPress={() => navigation.navigate('InterventionDetail', { interventionId: intervention.id })}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: 'bold', color: COLORS.primary }}>{intervention.reference}</Text>
                    <Text style={{ fontSize: 15, fontWeight: '600', color: COLORS.text, marginTop: 2 }}>
                      {TYPE_LABELS[intervention.type] || intervention.type}
                    </Text>
                  </View>
                  <View style={{ backgroundColor: STATUS_COLORS[intervention.status] || '#6b7280', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}>
                    <Text style={{ color: '#fff', fontSize: 11, fontWeight: '600' }}>
                      {STATUS_LABELS[intervention.status] || intervention.status}
                    </Text>
                  </View>
                </View>
                <Text style={{ fontSize: 13, color: COLORS.textMuted }}>
                  📍 {getDisplayAddress(intervention)}
                </Text>
                {intervention.scheduledAt && (
                  <Text style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 4 }}>
                    📅 {formatDate(intervention.scheduledAt)}
                  </Text>
                )}
              </TouchableOpacity>
            ))
          )}
        </View>
        <View style={{ height: 100 }} />
      </ScrollView>
    )}

    {/* ===== VUE PROFIL ===== */}
    {mainView === 'profile' && (
      <ScrollView style={styles.container}>
        <View style={{ padding: 16, paddingTop: 60 }}>
          <Text style={{ fontSize: 22, fontWeight: 'bold', color: COLORS.text, marginBottom: 20 }}>Mon profil</Text>
          <View style={{ backgroundColor: '#fff', borderRadius: 14, padding: 20, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', marginBottom: 16 }}>
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
              <Text style={{ color: '#fff', fontSize: 22, fontWeight: 'bold' }}>
                {user?.name ? user.name.split(' ').map((n: string) => n[0]).join('').toUpperCase().substring(0, 2) : '?'}
              </Text>
            </View>
            <Text style={{ fontSize: 18, fontWeight: '600', color: COLORS.text }}>{user?.name || 'Technicien'}</Text>
            <Text style={{ fontSize: 13, color: COLORS.textMuted, marginTop: 2 }}>{user?.email || ''}</Text>
            <Text style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 2 }}>Commission : {stats.commissionRate}%</Text>
          </View>
          <TouchableOpacity
            style={{ backgroundColor: '#fff', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: COLORS.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}
            onPress={() => navigation.navigate('TechnicianSettings')}
          >
            <Text style={{ fontSize: 15, fontWeight: '500', color: COLORS.text }}>⚙️  Paramètres</Text>
            <Text style={{ color: COLORS.textMuted }}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={{ backgroundColor: '#fff', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: COLORS.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}
            onPress={() => navigation.navigate('MyDocuments')}
          >
            <Text style={{ fontSize: 15, fontWeight: '500', color: COLORS.text }}>📋  Mes documents</Text>
            <Text style={{ color: COLORS.textMuted }}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={{ backgroundColor: '#fff', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: COLORS.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}
            onPress={() => navigation.navigate('BillingSettings')}
          >
            <Text style={{ fontSize: 15, fontWeight: '500', color: COLORS.text }}>💰  Facturation</Text>
            <Text style={{ color: COLORS.textMuted }}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={{ backgroundColor: '#fef2f2', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#fecaca', alignItems: 'center', marginTop: 12 }}
            onPress={logout}
          >
            <Text style={{ fontSize: 15, fontWeight: '600', color: '#dc2626' }}>Déconnexion</Text>
          </TouchableOpacity>
        </View>
        <View style={{ height: 100 }} />
      </ScrollView>
    )}

    {/* Bottom Navigation */}
    <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: COLORS.border, paddingBottom: 30, paddingTop: 10 }}>
      <TouchableOpacity style={{ flex: 1, alignItems: 'center', gap: 2 }} onPress={() => setMainView('home')}>
        <Text style={{ fontSize: 20 }}>🏠</Text>
        <Text style={{ fontSize: 10, fontWeight: '600', color: mainView === 'home' ? COLORS.primary : COLORS.textMuted }}>Accueil</Text>
      </TouchableOpacity>
      <TouchableOpacity style={{ flex: 1, alignItems: 'center', gap: 2 }} onPress={() => setMainView('interventions')}>
        <Text style={{ fontSize: 20 }}>🔧</Text>
        <Text style={{ fontSize: 10, fontWeight: '600', color: mainView === 'interventions' ? COLORS.primary : COLORS.textMuted }}>Mes Inters</Text>
      </TouchableOpacity>
      <TouchableOpacity style={{ flex: 1, alignItems: 'center', gap: 2, position: 'relative' }} onPress={() => navigation.navigate('Messaging')}>
        <Text style={{ fontSize: 20 }}>💬</Text>
        {unreadMessagesCount > 0 && (
          <View style={{ position: 'absolute', top: -4, right: '25%', backgroundColor: '#ef4444', minWidth: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#fff', fontSize: 9, fontWeight: 'bold' }}>{unreadMessagesCount > 99 ? '99+' : unreadMessagesCount}</Text>
          </View>
        )}
        <Text style={{ fontSize: 10, fontWeight: '600', color: COLORS.textMuted }}>Messages</Text>
      </TouchableOpacity>
      <TouchableOpacity style={{ flex: 1, alignItems: 'center', gap: 2 }} onPress={() => setMainView('profile')}>
        <Text style={{ fontSize: 20 }}>👤</Text>
        <Text style={{ fontSize: 10, fontWeight: '600', color: mainView === 'profile' ? COLORS.primary : COLORS.textMuted }}>Profil</Text>
      </TouchableOpacity>
    </View>

    {/* Modale de complétion intervention */}
    <Modal visible={showCompleteModal} transparent animationType="slide" onRequestClose={() => setShowCompleteModal(false)}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '90%', paddingBottom: 30 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' }}>
              <Text style={{ fontSize: 18, fontWeight: '700', color: '#111827' }}>📋 Rapport de fin d'intervention</Text>
              <TouchableOpacity onPress={() => setShowCompleteModal(false)}>
                <Text style={{ fontSize: 22, color: '#6b7280' }}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={{ padding: 16 }} keyboardShouldPersistTaps="handled">
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 6 }}>💰 Montants</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Montant final TTC (€) *</Text>
                  <TextInput value={cFinalAmount} onChangeText={setCFinalAmount} keyboardType="decimal-pad" placeholder="0.00" style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, padding: 12, fontSize: 15, backgroundColor: '#f9fafb' }} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Coût matériel (€)</Text>
                  <TextInput value={cMaterialCost} onChangeText={setCMaterialCost} keyboardType="decimal-pad" placeholder="0.00" style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, padding: 12, fontSize: 15, backgroundColor: '#f9fafb' }} />
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Temps passé (heures)</Text>
                  <TextInput value={cTimeSpent} onChangeText={setCTimeSpent} keyboardType="decimal-pad" placeholder="Ex: 1.5" style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, padding: 12, fontSize: 15, backgroundColor: '#f9fafb' }} />
                </View>
                <View style={{ flex: 1 }} />
              </View>

              <Text style={{ fontSize: 14, fontWeight: '600', color: '#374151', marginTop: 16, marginBottom: 6 }}>📝 Détails</Text>
              <Text style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Description des travaux</Text>
              <TextInput value={cDescription} onChangeText={setCDescription} multiline numberOfLines={3} placeholder="Décrivez les travaux effectués..." style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, padding: 12, fontSize: 15, backgroundColor: '#f9fafb', minHeight: 70, textAlignVertical: 'top' }} />
              <Text style={{ fontSize: 12, color: '#6b7280', marginBottom: 4, marginTop: 8 }}>Notes / Observations</Text>
              <TextInput value={cNotes} onChangeText={setCNotes} multiline numberOfLines={3} placeholder="Remarques, problèmes rencontrés..." style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, padding: 12, fontSize: 15, backgroundColor: '#f9fafb', minHeight: 70, textAlignVertical: 'top' }} />

              <Text style={{ fontSize: 14, fontWeight: '600', color: '#374151', marginTop: 16, marginBottom: 6 }}>📸 Photos</Text>
              {cPhotos.length > 0 && (
                <ScrollView horizontal style={{ marginBottom: 8 }}>
                  {cPhotos.map((uri, i) => (
                    <View key={i} style={{ marginRight: 8, position: 'relative' }}>
                      <Image source={{ uri }} style={{ width: 70, height: 70, borderRadius: 8 }} />
                      <TouchableOpacity onPress={() => setCPhotos(p => p.filter((_, idx) => idx !== i))} style={{ position: 'absolute', top: -6, right: -6, backgroundColor: '#ef4444', borderRadius: 10, width: 20, height: 20, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>
              )}
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity onPress={cTakePhoto} style={{ flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: '#2563eb', alignItems: 'center' }}>
                  <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13 }}>📷 Photo</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={cPickPhoto} style={{ flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: '#2563eb', alignItems: 'center' }}>
                  <Text style={{ color: '#2563eb', fontWeight: '600', fontSize: 13 }}>🖼️ Galerie</Text>
                </TouchableOpacity>
              </View>

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
                <TouchableOpacity onPress={() => setShowCompleteModal(false)} style={{ flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: '#f3f4f6', alignItems: 'center' }}>
                  <Text style={{ fontSize: 15, fontWeight: '600', color: '#6b7280' }}>Annuler</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleCompleteIntervention} disabled={completing} style={{ flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: '#059669', alignItems: 'center' }}>
                  {completing ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>✓ Terminer</Text>}
                </TouchableOpacity>
              </View>
              <View style={{ height: 20 }} />
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>

    {/* Modale d'annulation intervention */}
    <Modal visible={showCancelModal} transparent animationType="slide" onRequestClose={() => setShowCancelModal(false)}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', paddingHorizontal: 24 }}>
        <View style={{ backgroundColor: '#fff', borderRadius: 20, paddingBottom: 20 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: '#111827' }}>❌ Annuler l'intervention</Text>
            <TouchableOpacity onPress={() => setShowCancelModal(false)}>
              <Text style={{ fontSize: 22, color: '#6b7280' }}>✕</Text>
            </TouchableOpacity>
          </View>
          <Text style={{ fontSize: 14, color: '#6b7280', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 }}>Sélectionnez la raison :</Text>
          <View style={{ paddingHorizontal: 16 }}>
            {CANCEL_REASONS.map((reason) => (
              <TouchableOpacity
                key={reason}
                onPress={() => setSelectedCancelReason(reason)}
                style={{ flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 12, backgroundColor: selectedCancelReason === reason ? '#fef2f2' : '#f9fafb', marginBottom: 6, borderWidth: 1.5, borderColor: selectedCancelReason === reason ? '#f87171' : '#e5e7eb' }}
              >
                <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: selectedCancelReason === reason ? '#dc2626' : '#d1d5db', backgroundColor: selectedCancelReason === reason ? '#dc2626' : '#fff', justifyContent: 'center', alignItems: 'center', marginRight: 12 }}>
                  {selectedCancelReason === reason && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' }} />}
                </View>
                <Text style={{ fontSize: 15, fontWeight: selectedCancelReason === reason ? '600' : '400', color: selectedCancelReason === reason ? '#dc2626' : '#374151' }}>{reason}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={{ paddingHorizontal: 16, marginTop: 12, flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity
              onPress={() => setShowCancelModal(false)}
              style={{ flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: '#f3f4f6', alignItems: 'center' }}
            >
              <Text style={{ fontSize: 15, fontWeight: '600', color: '#6b7280' }}>Retour</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleCancelIntervention}
              disabled={!selectedCancelReason || cancelling}
              style={{ flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: selectedCancelReason ? '#dc2626' : '#fca5a5', alignItems: 'center' }}
            >
              {cancelling ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={{ fontSize: 15, fontWeight: '600', color: '#fff' }}>Confirmer</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    backgroundColor: '#ffffff',
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  settingsButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative' as const,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  settingsButtonText: {
    fontSize: 20,
  },
  messageBadge: {
    position: 'absolute' as const,
    top: -4,
    right: -4,
    backgroundColor: '#ef4444',
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  messageBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold' as const,
  },
  greeting: {
    fontSize: 14,
    color: COLORS.textMuted,
  },
  userName: {
    fontSize: 26,
    fontWeight: 'bold',
    color: COLORS.text,
    marginTop: 2,
  },
  commissionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#bfdbfe',
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
    color: COLORS.textMuted,
  },
  commissionValue: {
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  commissionHint: {
    fontSize: 11,
    color: COLORS.textMuted,
    textAlign: 'right',
    maxWidth: 80,
  },
  availabilityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ecfdf5',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  unavailableBadge: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
  },
  availabilityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#22c55e',
    marginRight: 6,
  },
  unavailableDot: {
    backgroundColor: '#ef4444',
  },
  availabilityText: {
    color: '#065f46',
    fontSize: 12,
    fontWeight: '600',
  },
  unavailableText: {
    color: '#991b1b',
  },
  statsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    marginTop: 16,
    gap: 10,
  },
  statCard: {
    flex: 1,
    minWidth: '30%',
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
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
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
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
    backgroundColor: COLORS.primary,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
  },
  acceptButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  declineButton: {
    flex: 1,
    backgroundColor: '#fff',
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  declineButtonText: {
    color: COLORS.textMuted,
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
  documentsShortcut: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.card,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e0e7ff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  documentsShortcutLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  documentsShortcutIcon: {
    fontSize: 28,
  },
  documentsShortcutTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
  },
  documentsShortcutSubtitle: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  documentsShortcutArrow: {
    fontSize: 24,
    color: COLORS.textMuted,
    fontWeight: '300',
  },
});
