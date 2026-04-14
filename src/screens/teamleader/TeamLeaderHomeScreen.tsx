import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
  TextInput,
  Modal,
  Dimensions,
  ActivityIndicator,
  Linking,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../services/api';
import { COLORS, STATUS_COLORS, STATUS_LABELS, TYPE_LABELS, API_BASE_URL } from '../../config/api';
import * as SecureStore from 'expo-secure-store';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { Image, KeyboardAvoidingView } from 'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface Technician {
  id: string;
  userId?: string;
  user_id?: string;
  name: string;
  email: string;
  phone?: string;
  available?: boolean;
  isAvailable?: boolean;
  isActive?: boolean;
  commissionPercentage?: number;
  currentLocation?: { lat: number; lng: number };
  specialties?: string[];
}

interface Intervention {
  id: string;
  reference: string;
  type: string;
  status: string;
  clientName?: string;
  clientPhone?: string;
  clientEmail?: string;
  client?: { name?: string; phone?: string };
  address?: { city?: string; street?: string; postalCode?: string };
  amountTTC?: number;
  scheduledDate?: string;
  scheduledAt?: string;
  technicianId?: string;
}

interface Stats {
  totalTechnicians: number;
  availableTechnicians?: number;
  completedInterventions: number;
  totalInterventions: number;
  totalRevenue: number;
  netProfit: number;
  totalToReceive: number;
  totalToPayTechnicians: number;
  commissionFromAdmin?: number;
  billingType?: string;
  technicianStats?: Array<{
    id: string;
    name: string;
    interventionsCount: number;
    revenue: number;
    commissionPercentage: number;
    toPay: number;
    isTL?: boolean;
  }>;
}

interface TeamLeader {
  id: string;
  userId: string;
  name: string;
  email: string;
  phone?: string;
  commissionFromAdmin?: number;
  defaultTechnicianCommission?: number;
  billingType?: string;
  selectedDepartments?: string[];
  activityIds?: string[];
}

type MainView = 'stats' | 'interventions' | 'technicians' | 'settings';

export default function TeamLeaderHomeScreen({ navigation }: any) {
  const { user, logout } = useAuth();
  const [teamLeader, setTeamLeader] = useState<TeamLeader | null>(null);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [interventions, setInterventions] = useState<Intervention[]>([]);
  const [availableInterventions, setAvailableInterventions] = useState<Intervention[]>([]);
  const [myActiveInterventions, setMyActiveInterventions] = useState<Intervention[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [stats, setStats] = useState<Stats>({
    totalTechnicians: 0,
    completedInterventions: 0,
    totalInterventions: 0,
    totalRevenue: 0,
    netProfit: 0,
    totalToReceive: 0,
    totalToPayTechnicians: 0,
  });
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [mainView, setMainView] = useState<MainView>('stats');
  const [editingCommission, setEditingCommission] = useState<string | null>(null);
  const [commissionValue, setCommissionValue] = useState('');
  const [selectedTechnician, setSelectedTechnician] = useState<Technician | null>(null);
  const [savingCommission, setSavingCommission] = useState(false);
  const [activityNames, setActivityNames] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);
  
  // Modales pour les cartes de stats
  const [showTechniciansModal, setShowTechniciansModal] = useState(false);
  const [showInterventionsModal, setShowInterventionsModal] = useState(false);
  const [showRevenueModal, setShowRevenueModal] = useState(false);
  const [showProfitModal, setShowProfitModal] = useState(false);

  // Modale d'assignation intervention → technicien
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assigningInterventionId, setAssigningInterventionId] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);

  // Modification nom affiché
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState('');
  const [savingName, setSavingName] = useState(false);

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

  // Afficher TOUS les techniciens (pas seulement ceux avec secteurs validés)
  const validatedTechnicians = useMemo(() => {
    if (!technicians) return [];
    // Retourner tous les techniciens de l'équipe
    return technicians;
  }, [technicians]);

  // Interventions groupées par technicien
  const interventionsByTechnician = useMemo(() => {
    const result: Record<string, Intervention[]> = {};
    validatedTechnicians.forEach(tech => {
      result[tech.id] = interventions.filter(i => i.technicianId === tech.id);
    });
    return result;
  }, [interventions, validatedTechnicians]);

  const loadData = useCallback(async () => {
    setLoadError(null);
    try {
      // 1. Charger le profil TL en premier (fetch direct pour éviter perte de données)
      const token = await SecureStore.getItemAsync('authToken');
      const profileRes = await fetch(`${API_BASE_URL}/team-leaders/me`, {
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      const profileRaw = await profileRes.json().catch(() => ({}));
      if (!profileRes.ok) {
        const errMsg = profileRaw?.error || profileRaw?.message || profileRaw?.detail || `Erreur serveur ${profileRes.status}`;
        const details = profileRaw?.details || profileRaw?.steps;
        const fullMsg = details ? (typeof details === 'object' ? `${errMsg} | ${JSON.stringify(details)}` : `${errMsg}: ${details}`) : errMsg;
        logErrorDetailed({
          file: 'src/screens/teamleader/TeamLeaderHomeScreen.tsx',
          line: 146,
          function: 'loadData',
          code: 'if (!profileRes.ok) { ... throw new Error(fullMsg); }',
          message: `API GET /team-leaders/me → ${profileRes.status} ${profileRes.statusText}`,
          context: {
            endpoint: `${API_BASE_URL}/team-leaders/me`,
            method: 'GET',
            status: profileRes.status,
            statusText: profileRes.statusText,
            responseBody: profileRaw,
            responseHeaders: Object.fromEntries(profileRes.headers.entries()),
            tokenPresent: !!token,
          },
        });
        // Si 500 sans détails, appeler le debug pour obtenir le diagnostic
        if (profileRes.status === 500 && !profileRaw?.details && token) {
          try {
            const debugRes = await fetch(`${API_BASE_URL}/team-leaders/me/debug`, {
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            });
            const debugRaw = await debugRes.json().catch(() => ({}));
            if (debugRaw?.steps || debugRaw?.error) {
              logErrorDetailed({
                file: 'src/screens/teamleader/TeamLeaderHomeScreen.tsx',
                line: 168,
                function: 'loadData',
                code: 'fetch /team-leaders/me/debug',
                message: 'Diagnostic backend 500',
                context: { debugRaw },
              });
              const debugMsg = debugRaw?.error ? `${debugRaw.error} | ${JSON.stringify(debugRaw.steps || {})}` : `${errMsg} | ${JSON.stringify(debugRaw?.steps || {})}`;
              throw new Error(debugMsg);
            }
          } catch (debugErr: any) {
            // Rethrow si on a reçu une réponse debug (erreur utile plutôt que "Erreur serveur")
            if (debugErr?.message && !debugErr.message.startsWith('Erreur serveur')) throw debugErr;
          }
        }
        throw new Error(fullMsg);
      }
      const raw = profileRaw?.data ?? profileRaw?.teamLeader ?? profileRaw;
      if (!raw) throw new Error('Réponse invalide');
      const inv = raw.invitation ?? raw.invitationConfig ?? raw.invitation_config ?? {};
      const tl = {
        ...raw,
        commissionFromAdmin: raw.commissionFromAdmin ?? raw.commission_from_admin ?? inv.commissionFromAdmin ?? inv.commission_from_admin ?? raw.commission ?? inv.commission ?? raw.commissionPercentage ?? inv.commissionPercentage,
        billingType: raw.billingType ?? raw.billing_type ?? inv.billingType ?? inv.billing_type,
        defaultTechnicianCommission: raw.defaultTechnicianCommission ?? raw.default_technician_commission ?? inv.defaultTechnicianCommission ?? inv.default_technician_commission,
        selectedDepartments: raw.selectedDepartments ?? raw.selected_departments ?? inv.selectedDepartments ?? inv.selected_departments ?? [],
        activityIds: raw.activityIds ?? raw.activity_ids ?? inv.activityIds ?? inv.activity_ids ?? [],
        activities: raw.activities ?? inv.activities ?? [],
      };
      setTeamLeader(tl);

      // 2. Charger les données en parallèle
      // Ne pas passer tl.id pour utiliser /me/technicians (utilise l'utilisateur connecté)
      const [techData, pendingData, completedData, invoicedData, paidData, assignmentsData, statsData, activitiesData] = await Promise.all([
        api.getTeamLeaderTechnicians().catch((err) => {
          logErrorDetailed({
            file: 'src/screens/teamleader/TeamLeaderHomeScreen.tsx',
            line: 196,
            function: 'loadData',
            code: 'api.getTeamLeaderTechnicians()',
            message: String(err instanceof Error ? err.message : err),
            error: err,
          });
          return [];
        }),
        api.getInterventions({ status: ['pending', 'notified'] }).catch(() => []),
        api.getInterventions({ status: 'completed' }).catch(() => []),
        api.getInterventions({ status: 'invoiced' }).catch(() => []),
        api.getInterventions({ status: 'paid' }).catch(() => []),
        api.getSectorAssignments().catch(() => []),
        api.getTeamLeaderStats(tl?.id).catch(() => null),
        api.getActivities().catch(() => []),
      ]);

      // Normaliser les réponses (certaines APIs retournent { data: [...] })
      const toArray = (x: any) => Array.isArray(x) ? x : (x?.data ? (Array.isArray(x.data) ? x.data : []) : []);

      // Charger aussi les autres statuts
      const [acceptedData, enRouteData, onSiteData] = await Promise.all([
        api.getInterventions({ status: 'accepted' }).catch(() => []),
        api.getInterventions({ status: 'en_route' }).catch(() => []),
        api.getInterventions({ status: 'on_site' }).catch(() => []),
      ]);

      // Combiner toutes les interventions (y compris facturées et payées)
      const allInterventions = [
        ...toArray(pendingData),
        ...toArray(acceptedData),
        ...toArray(enRouteData),
        ...toArray(onSiteData),
        ...toArray(completedData),
        ...toArray(invoicedData),
        ...toArray(paidData),
      ];
      
      // Dédupliquer
      const seen = new Set<string>();
      const interventionsData = allInterventions.filter((i: any) => {
        if (seen.has(i.id)) return false;
        seen.add(i.id);
        return true;
      });

      setTechnicians(Array.isArray(techData) ? techData : (techData?.data || []));
      // Filtrer les interventions refusées par cet utilisateur
      const myUserId = user?.id;
      const filteredInterventions = myUserId
        ? interventionsData.filter((i: any) => {
            const declined: string[] = i.declinedBy || i.declined_by || [];
            return !declined.includes(myUserId);
          })
        : interventionsData;
      setInterventions(filteredInterventions);
      setAssignments(Array.isArray(assignmentsData) ? assignmentsData : []);
      // Map activity IDs to names: priorité au tableau activities fourni par GET /team-leaders/me
      const actsFromTl = Array.isArray(tl?.activities) ? tl.activities : [];
      const actsFromApi = Array.isArray(activitiesData) ? activitiesData : [];
      const acts = actsFromTl.length > 0 ? actsFromTl : actsFromApi;
      const namesMap: Record<string, string> = {};
      acts.forEach((a: { id: string; name: string }) => { if (a?.id && a?.name) namesMap[a.id] = a.name; });
      setActivityNames(namesMap);

      // Filtrer les interventions disponibles
      const available = toArray(pendingData).filter((i: Intervention) =>
        ['pending', 'notified'].includes(i.status)
      );
      setAvailableInterventions(available);
      
      // Mes interventions en cours (acceptées par le TL lui-même)
      const myActive = [...toArray(acceptedData), ...toArray(enRouteData), ...toArray(onSiteData)].filter((i: Intervention) =>
        i.teamLeaderId === tl?.id || i.technicianId === tl?.userId
      );
      setMyActiveInterventions(myActive);

      // TOUJOURS calculer les stats financières localement à partir des interventions terminées
      const techArray = Array.isArray(techData) ? techData : (techData?.data || []);
      
      // Utiliser toutes les interventions terminées (completed + invoiced + paid)
      const allCompletedInterventions = [
        ...toArray(completedData),
        ...toArray(invoicedData),
        ...toArray(paidData),
      ];
      // Dédupliquer
      const seenCompleted = new Set<string>();
      const completedInterventions = allCompletedInterventions.filter((i: any) => {
        if (seenCompleted.has(i.id)) return false;
        seenCompleted.add(i.id);
        return true;
      });
      const completedCount = (completedInterventions || []).length;

      console.log(`[TL Dashboard] Total: ${(interventionsData || []).length}, Terminées: ${completedCount}, Techs: ${(techArray || []).length}`);
      console.log(`[TL Stats Debug] Interventions terminées: ${completedCount}, Techniciens: ${(techArray || []).length}`);
      if (completedInterventions.length > 0) {
        console.log(`[TL Stats Debug] Exemple intervention:`, JSON.stringify({
          id: completedInterventions[0].id,
          amountTTC: completedInterventions[0].amountTTC,
          amountRealized: completedInterventions[0].amountRealized,
          technicianId: completedInterventions[0].technicianId,
        }));
      }

      // Calculer le chiffre d'affaires total (convertir en nombre car peut être string depuis DB)
      const totalRevenue = completedInterventions
        .reduce((sum: number, i: any) => {
          const amount = parseFloat(i.amountTTC) || parseFloat(i.amountRealized) || 0;
          console.log(`[TL Stats Debug] Intervention ${i.id}: amountTTC=${i.amountTTC}, parsed=${amount}`);
          return sum + amount;
        }, 0);

      // Identifier le profil technicien du TL lui-même (pour exclure ses propres interventions du "à verser")
      const tlTechProfile = techArray.find((t: any) => (t.userId || t.user_id) === tl.userId);
      const tlTechId = tlTechProfile?.id;

      // Calculer le montant à verser aux techniciens (exclure le TL lui-même, exclure les déjà payés)
      let totalToPayTechnicians = 0;
      completedInterventions.forEach((intervention: any) => {
        // Exclure les interventions faites par le TL lui-même
        if (tlTechId && intervention.technicianId === tlTechId) return;
        const reversalStatus = intervention.reversalStatus || intervention.reversal_status;
        // Exclure les déjà payés
        if (reversalStatus === 'paid') return;
        const reversalAmount = parseFloat(intervention.reversalAmount || intervention.reversal_amount) || 0;
        if (reversalAmount > 0) {
          totalToPayTechnicians += reversalAmount;
        } else {
          const tech = techArray.find((t: any) => t.id === intervention.technicianId);
          const amount = parseFloat(intervention.amountTTC) || parseFloat(intervention.amountRealized) || 0;
          const techCommission = tech ? (parseFloat(tech.commissionPercentage) || 30) : 30;
          totalToPayTechnicians += amount * (techCommission / 100);
        }
      });

      const commissionRate = tl.commissionFromAdmin != null ? parseFloat(String(tl.commissionFromAdmin)) : 0;

      // "À recevoir" de l'admin = commission TL sur interventions non encore payées (pending + validated)
      let totalToReceive = 0;
      completedInterventions.forEach((intervention: any) => {
        const rStatus = intervention.reversalStatus || intervention.reversal_status;
        if (rStatus === 'paid') return; // Déjà payé
        const amount = parseFloat(intervention.amountTTC) || parseFloat(intervention.amountRealized) || 0;
        totalToReceive += amount * (commissionRate / 100);
      });

      const netProfit = Math.max(0, totalToReceive - totalToPayTechnicians);

      console.log(`[TL Stats] CA: ${totalRevenue}, Commission TL: ${commissionRate}%, À verser techs: ${totalToPayTechnicians}, Profit: ${netProfit}`);

      // Calculer les stats par technicien LOCALEMENT (au lieu de l'API qui renvoie 0)
      const techStatsMap = new Map<string, { id: string; name: string; interventionsCount: number; revenue: number; commissionPercentage: number; toPay: number; isTL: boolean }>();

      // Initialiser chaque technicien
      techArray.forEach((tech: any) => {
        techStatsMap.set(tech.id, {
          id: tech.id,
          name: tech.name || `${tech.firstName || ''} ${tech.lastName || ''}`.trim() || 'Technicien',
          interventionsCount: 0,
          revenue: 0,
          commissionPercentage: parseFloat(tech.commissionPercentage) || 30,
          toPay: 0,
          isTL: tech.id === tlTechId,
        });
      });

      // Agréger les interventions terminées par technicien
      completedInterventions.forEach((intervention: any) => {
        const techId = intervention.technicianId;
        const amount = parseFloat(intervention.amountTTC) || parseFloat(intervention.amountRealized) || 0;
        const reversalStatus = intervention.reversalStatus || intervention.reversal_status;
        const existing = techStatsMap.get(techId);
        if (existing) {
          existing.interventionsCount += 1;
          existing.revenue += amount;
          // Seulement les interventions non encore payées (pending ou validated)
          if (reversalStatus !== 'paid') {
            if (techId === tlTechId) {
              // TL lui-même : "à recevoir" de l'admin = montant × commission admin
              existing.toPay += amount * (commissionRate / 100);
            } else {
              // Autre tech : "à verser" par le TL
              const reversalAmt = parseFloat(intervention.reversalAmount || intervention.reversal_amount) || 0;
              existing.toPay += reversalAmt > 0 ? reversalAmt : amount * (existing.commissionPercentage / 100);
            }
          }
        }
      });

      const localTechnicianStats = Array.from(techStatsMap.values());
      console.log(`[TL Stats] technicianStats calculées localement:`, JSON.stringify(localTechnicianStats));

      setStats({
        totalTechnicians: (techArray || []).length,
        completedInterventions: completedCount,
        totalInterventions: (interventionsData || []).length,
        totalRevenue,
        netProfit: Math.max(0, netProfit),
        totalToReceive,
        totalToPayTechnicians,
        commissionFromAdmin: tl.commissionFromAdmin != null ? parseFloat(String(tl.commissionFromAdmin)) : undefined,
        billingType: tl.billingType,
        technicianStats: localTechnicianStats,
      });

      // Charger le nombre de messages non lus
      try {
        const convRes = await fetch(`${API_BASE_URL}/messaging/conversations`, {
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });
        if (convRes.ok) {
          const convData = await convRes.json();
          const totalUnread = Array.isArray(convData)
            ? convData.reduce((sum: number, c: any) => sum + (c.unread_count || 0), 0)
            : 0;
          setUnreadMessagesCount(totalUnread);
        }
      } catch (msgErr) {
        console.log('[TL Dashboard] Erreur chargement messages non lus:', msgErr);
      }
    } catch (error: any) {
      const msg = error?.message || error?.response?.data?.error || error?.response?.data?.details || 'Erreur de chargement';
      logErrorDetailed({
        file: 'src/screens/teamleader/TeamLeaderHomeScreen.tsx',
        line: 327,
        function: 'loadData',
        code: 'try { ... loadData ... } catch',
        message: msg,
        error,
        context: { loadError: msg },
      });
      setLoadError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount);
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
  };

  const handleAcceptIntervention = async (interventionId: string) => {
    try {
      await api.acceptIntervention(interventionId);
      await loadData();
    } catch (error: any) {
      logErrorDetailed({
        file: 'src/screens/teamleader/TeamLeaderHomeScreen.tsx',
        line: 378,
        function: 'handleAcceptIntervention',
        code: 'api.acceptIntervention(interventionId)',
        message: String(error?.message || 'Impossible d\'accepter'),
        error,
        context: { interventionId },
      });
      Alert.alert('Erreur', error.message || 'Impossible d\'accepter');
    }
  };

  const openNavigationChoice = (address: { street?: string; postalCode?: string; city?: string }, interventionId?: string) => {
    const addr = `${address.street || ''}, ${address.postalCode || ''} ${address.city || ''}`.trim();
    const encoded = encodeURIComponent(addr);
    const startNavAndRoute = (url: string) => {
      Linking.openURL(url);
      if (interventionId) {
        api.updateInterventionStatus(interventionId, 'en_route').then(() => loadData()).catch(() => {});
      }
    };
    Alert.alert('Naviguer vers le client', addr, [
      { text: 'Waze', onPress: () => startNavAndRoute(`https://waze.com/ul?q=${encoded}&navigate=yes`) },
      { text: 'Plans', onPress: () => startNavAndRoute(Platform.OS === 'ios' ? `maps:?daddr=${encoded}` : `geo:0,0?q=${encoded}`) },
      { text: 'Google Maps', onPress: () => startNavAndRoute(`https://www.google.com/maps/search/?api=1&query=${encoded}`) },
      { text: 'Annuler', style: 'cancel' },
    ]);
  };

  const handleOpenAssignModal = (interventionId: string) => {
    setAssigningInterventionId(interventionId);
    setShowAssignModal(true);
  };

  const handleAssignToTech = async (technicianId: string) => {
    if (!assigningInterventionId) return;
    setAssigning(true);
    try {
      await api.assignInterventionToTech(assigningInterventionId, technicianId);
      setShowAssignModal(false);
      setAssigningInterventionId(null);
      Alert.alert('Intervention envoyée', 'Le technicien va recevoir une notification.');
      loadData();
    } catch (error: any) {
      Alert.alert('Erreur', error.message || 'Impossible d\'assigner l\'intervention');
    } finally {
      setAssigning(false);
    }
  };

  const handleOpenCancelModal = (interventionId: string) => {
    setCancellingInterventionId(interventionId);
    setSelectedCancelReason(null);
    setShowCancelModal(true);
  };

  const handleSaveName = async () => {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === teamLeader?.name) {
      setEditingName(false);
      return;
    }
    setSavingName(true);
    try {
      await api.updateMyTLProfile({ name: trimmed });
      setTeamLeader(prev => prev ? { ...prev, name: trimmed } : prev);
      setEditingName(false);
      Alert.alert('Succès', 'Votre nom a été mis à jour.');
    } catch {
      Alert.alert('Erreur', 'Impossible de mettre à jour le nom.');
    } finally {
      setSavingName(false);
    }
  };

  const handleCancelIntervention = async () => {
    if (!cancellingInterventionId || !selectedCancelReason) return;
    setCancelling(true);
    try {
      await api.declineIntervention(cancellingInterventionId, selectedCancelReason);
      setShowCancelModal(false);
      setCancellingInterventionId(null);
      setSelectedCancelReason(null);
      Alert.alert('Intervention refusée', 'L\'intervention n\'est plus visible pour vous. L\'admin en est informé.');
      loadData();
    } catch (error: any) {
      Alert.alert('Erreur', error.message || 'Impossible de refuser l\'intervention');
    } finally {
      setCancelling(false);
    }
  };

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

  const handleSaveCommission = async (technicianId: string) => {
    const value = parseFloat(commissionValue);
    if (isNaN(value) || value < 0 || value > 100) {
      Alert.alert('Erreur', 'Pourcentage invalide (0-100)');
      return;
    }

    setSavingCommission(true);
    try {
      await api.updateTechnicianCommission(teamLeader!.id, technicianId, value);
      Alert.alert('Succès', 'Commission mise à jour');
      setEditingCommission(null);
      loadData();
    } catch (error: any) {
      logErrorDetailed({
        file: 'src/screens/teamleader/TeamLeaderHomeScreen.tsx',
        line: 400,
        function: 'handleSaveCommission',
        code: 'api.updateTechnicianCommission(teamLeader!.id, technicianId, value)',
        message: String(error?.message || 'Impossible de mettre à jour'),
        error,
        context: { technicianId, value },
      });
      Alert.alert('Erreur', error.message || 'Impossible de mettre à jour');
    } finally {
      setSavingCommission(false);
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

  // Écran d'erreur plein quand le chargement initial échoue (pas de profil TL)
  if (loadError && !teamLeader) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.errorFullScreen}>
          <Text style={styles.errorFullScreenIcon}>⚠️</Text>
          <Text style={styles.errorFullScreenTitle}>Erreur de chargement</Text>
          <Text style={styles.errorFullScreenMessage} numberOfLines={4}>{loadError}</Text>
          <TouchableOpacity
            style={styles.errorFullScreenRetryButton}
            onPress={() => { setLoadError(null); setLoading(true); loadData(); }}
          >
            <Text style={styles.errorFullScreenRetryText}>Réessayer</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.errorFullScreenLogoutButton} onPress={logout}>
            <Text style={styles.errorFullScreenLogoutText}>Retour à la connexion</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {loadError && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText} numberOfLines={2}>⚠️ {loadError}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => { setLoadError(null); loadData(); }}>
            <Text style={styles.retryButtonText}>Réessayer</Text>
          </TouchableOpacity>
        </View>
      )}
      {/* ===== VUE STATS ===== */}
      {mainView === 'stats' && (
        <ScrollView
          style={styles.scrollView}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} />
          }
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTop}>
              <View style={styles.headerLeft}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {teamLeader?.name ? getInitials(teamLeader.name) : 'TL'}
                  </Text>
                </View>
                <View>
                  <Text style={styles.userName}>{teamLeader?.name || 'Utilisateur'}</Text>
                  <Text style={styles.userRole}>Responsable d'équipe</Text>
                </View>
              </View>
              <View style={styles.headerActions}>
                <TouchableOpacity style={styles.headerButton} onPress={onRefresh}>
                  <Text style={styles.headerButtonIcon}>↻</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.headerButton} onPress={logout}>
                  <Text style={styles.headerButtonIcon}>⎋</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Stats Grid - Cartes cliquables */}
          <View style={styles.content}>
            <View style={styles.statsGrid}>
              <TouchableOpacity 
                style={[styles.statCard, styles.blueCard]}
                onPress={() => setShowTechniciansModal(true)}
                activeOpacity={0.8}
              >
                <Text style={styles.statIcon}>👥</Text>
                <Text style={styles.statNumber}>{stats.totalTechnicians || validatedTechnicians.length}</Text>
                <Text style={styles.statLabel}>Techniciens</Text>
                <Text style={styles.statSublabel}>dans l'équipe</Text>
                <Text style={styles.tapHint}>Appuyer pour détails</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.statCard, styles.greenCard]}
                onPress={() => setShowInterventionsModal(true)}
                activeOpacity={0.8}
              >
                <Text style={styles.statIcon}>✓</Text>
                <Text style={styles.statNumber}>{stats.completedInterventions || 0}</Text>
                <Text style={styles.statLabel}>Interventions</Text>
                <Text style={styles.statSublabel}>/ {stats.totalInterventions || 0} total</Text>
                <Text style={styles.tapHint}>Appuyer pour détails</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.statCard, styles.yellowCard]}
                onPress={() => setShowRevenueModal(true)}
                activeOpacity={0.8}
              >
                <Text style={styles.statIcon}>💰</Text>
                <Text style={[styles.statNumber, styles.smallerNumber]}>
                  {formatCurrency(stats.totalRevenue || 0)}
                </Text>
                <Text style={styles.statLabel}>Chiffre d'affaires</Text>
                <Text style={styles.statSublabel}>Commission: {stats.commissionFromAdmin != null ? `${stats.commissionFromAdmin}%` : '—'}</Text>
                <Text style={styles.tapHint}>Appuyer pour détails</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.statCard, styles.purpleCard]}
                onPress={() => setShowProfitModal(true)}
                activeOpacity={0.8}
              >
                <Text style={styles.statIcon}>📈</Text>
                <Text style={[styles.statNumber, styles.profitNumber]}>
                  {formatCurrency(stats.netProfit || 0)}
                </Text>
                <Text style={styles.statLabel}>Profit net</Text>
                <Text style={[styles.statSublabel, styles.greenText]}>
                  À recevoir: {formatCurrency(stats.totalToReceive || 0)}
                </Text>
                <Text style={[styles.statSublabel, styles.orangeText]}>
                  À verser: {formatCurrency(stats.totalToPayTechnicians || 0)}
                </Text>
                <Text style={styles.tapHint}>Appuyer pour détails</Text>
              </TouchableOpacity>
            </View>

            {/* Raccourcis équipe */}
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
              <TouchableOpacity
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 12, backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe' }}
                onPress={() => navigation.navigate('InviteTechnician')}
              >
                <Text style={{ fontSize: 14 }}>➕</Text>
                <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.primary }}>Inviter un tech</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.border }}
                onPress={() => setMainView('technicians')}
              >
                <Text style={{ fontSize: 14 }}>👥</Text>
                <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.text }}>Mon équipe</Text>
              </TouchableOpacity>
            </View>

            {/* Mes interventions en cours */}
            {myActiveInterventions.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>⚡ Mes interventions en cours</Text>
                {myActiveInterventions.map((intervention) => {
                  // Mini barre de progression
                  const step = intervention.status === 'accepted' ? 1 
                    : intervention.status === 'en_route' ? 2 
                    : ['on_site', 'in_progress'].includes(intervention.status) ? 3 : 0;
                  
                  return (
                    <View 
                      key={intervention.id} 
                      style={[styles.interventionCard, styles.activeInterventionCard]}
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
                        <View>
                          <Text style={styles.interventionReference}>{intervention.reference}</Text>
                          <Text style={styles.interventionType}>
                            {TYPE_LABELS[intervention.type] || intervention.type}
                          </Text>
                        </View>
                        <View style={[
                          styles.statusBadge,
                          { backgroundColor: STATUS_COLORS[intervention.status] || '#6b7280' }
                        ]}>
                          <Text style={styles.statusBadgeText}>
                            {STATUS_LABELS[intervention.status] || intervention.status}
                          </Text>
                        </View>
                      </View>
                      {(intervention.clientName || intervention.client?.name) && (
                        <Text style={styles.interventionClient}>👤 {intervention.clientName || intervention.client?.name}</Text>
                      )}
                      {(intervention.address?.street || intervention.address?.city) && (
                        <Text style={styles.interventionAddress}>📍 {[intervention.address?.street, [intervention.address?.postalCode, intervention.address?.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')}</Text>
                      )}
                      {intervention.amount && (
                        <Text style={{ fontSize: 15, fontWeight: '700', color: '#059669', marginTop: 4 }}>{intervention.amount} €</Text>
                      )}

                      {/* Boutons d'actions rapides */}
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                        {validatedTechnicians.length > 0 && (
                          <TouchableOpacity
                            onPress={() => handleOpenAssignModal(intervention.id)}
                            style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#2563eb', backgroundColor: '#f5f3ff' }}
                          >
                            <Text style={{ fontSize: 13, marginRight: 4 }}>📤</Text>
                            <Text style={{ fontSize: 11, fontWeight: '600', color: '#2563eb' }}>Transférer</Text>
                          </TouchableOpacity>
                        )}
                        {(intervention.clientPhone || intervention.client?.phone) && (
                          <TouchableOpacity
                            onPress={() => Linking.openURL(`tel:${intervention.clientPhone || intervention.client?.phone}`)}
                            style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#059669', backgroundColor: '#ecfdf5' }}
                          >
                            <Text style={{ fontSize: 13, marginRight: 4 }}>📞</Text>
                            <Text style={{ fontSize: 11, fontWeight: '600', color: '#059669' }}>Appeler</Text>
                          </TouchableOpacity>
                        )}
                        {(intervention.address?.street || intervention.address?.city) && (
                          <TouchableOpacity
                            onPress={() => openNavigationChoice(intervention.address, intervention.id)}
                            style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#2563eb', backgroundColor: '#eff6ff' }}
                          >
                            <Text style={{ fontSize: 13, marginRight: 4 }}>🗺️</Text>
                            <Text style={{ fontSize: 11, fontWeight: '600', color: '#2563eb' }}>Naviguer</Text>
                          </TouchableOpacity>
                        )}
                        <TouchableOpacity
                          onPress={() => handleOpenCancelModal(intervention.id)}
                          style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#dc2626', backgroundColor: '#fef2f2' }}
                        >
                          <Text style={{ fontSize: 13, marginRight: 4 }}>❌</Text>
                          <Text style={{ fontSize: 11, fontWeight: '600', color: '#dc2626' }}>Annuler</Text>
                        </TouchableOpacity>
                      </View>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
                        <TouchableOpacity
                          onPress={() => navigation.navigate('CreateQuote', { interventionId: intervention.id, intervention })}
                          style={{ flex: 1, minWidth: '40%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#f59e0b', backgroundColor: '#fffbeb' }}
                        >
                          <Text style={{ fontSize: 13, marginRight: 4 }}>📄</Text>
                          <Text style={{ fontSize: 11, fontWeight: '600', color: '#f59e0b' }}>Devis</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => navigation.navigate('CreateInvoice', { interventionId: intervention.id, intervention })}
                          style={{ flex: 1, minWidth: '40%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#8b5cf6', backgroundColor: '#f5f3ff' }}
                        >
                          <Text style={{ fontSize: 13, marginRight: 4 }}>🧾</Text>
                          <Text style={{ fontSize: 11, fontWeight: '600', color: '#8b5cf6' }}>Facture</Text>
                        </TouchableOpacity>
                      </View>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
                        <TouchableOpacity
                          onPress={() => navigation.navigate('Messaging', { interventionId: intervention.id, interventionRef: intervention.reference })}
                          style={{ flex: 1, minWidth: '40%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#0284c7', backgroundColor: '#f0f9ff' }}
                        >
                          <Text style={{ fontSize: 13, marginRight: 4 }}>💬</Text>
                          <Text style={{ fontSize: 11, fontWeight: '600', color: '#0284c7' }}>Message</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => navigation.navigate('MyDocuments', { interventionId: intervention.id })}
                          style={{ flex: 1, minWidth: '40%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#0284c7', backgroundColor: '#f0f9ff' }}
                        >
                          <Text style={{ fontSize: 13, marginRight: 4 }}>📋</Text>
                          <Text style={{ fontSize: 11, fontWeight: '600', color: '#0284c7' }}>Voir docs</Text>
                        </TouchableOpacity>
                      </View>

                      {/* Bouton de suivi / tracking */}
                      <TouchableOpacity 
                        style={[styles.continueButton, ['on_site', 'in_progress'].includes(intervention.status) && { backgroundColor: '#059669' }]}
                        onPress={async () => {
                          if (['on_site', 'in_progress'].includes(intervention.status)) {
                            handleOpenCompleteModal(intervention.id);
                          } else if (intervention.status === 'en_route') {
                            try {
                              await api.updateInterventionStatus(intervention.id, 'on_site');
                              await loadData();
                            } catch (e: any) {
                              Alert.alert('Erreur', e.message || 'Impossible de mettre à jour le statut');
                            }
                          } else if (intervention.status === 'accepted') {
                            try {
                              await api.updateInterventionStatus(intervention.id, 'en_route');
                              await loadData();
                            } catch (e: any) {
                              Alert.alert('Erreur', e.message || 'Impossible de mettre à jour le statut');
                            }
                          }
                        }}
                      >
                        <Text style={styles.continueButtonText}>
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

            {/* Interventions disponibles - pas de nom client (avant acceptation) */}
            {availableInterventions.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>🔔 Interventions disponibles ({availableInterventions.length})</Text>
                </View>
                <Text style={styles.sectionSubtitle}>Acceptez pour garder 100% de la commission</Text>
                {availableInterventions.slice(0, 5).map((intervention) => (
                  <View key={intervention.id} style={styles.availableCard}>
                    <View style={styles.availableCardHeader}>
                      <View style={styles.availableCardInfo}>
                        <Text style={styles.availableReference}>{intervention.reference}</Text>
                        <Text style={styles.availableType}>
                          {TYPE_LABELS[intervention.type] || intervention.type}
                        </Text>
                        {intervention.address?.city && (
                          <Text style={styles.availableAddress}>📍 {intervention.address.city}</Text>
                        )}
                      </View>
                      {intervention.amountTTC && (
                        <Text style={styles.availableAmount}>
                          {formatCurrency(intervention.amountTTC)}
                        </Text>
                      )}
                    </View>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <TouchableOpacity
                        style={[styles.acceptButton, { flex: 1 }]}
                        onPress={() => handleAcceptIntervention(intervention.id)}
                      >
                        <Text style={styles.acceptButtonText}>✓ Accepter</Text>
                      </TouchableOpacity>
                      {validatedTechnicians.length > 0 && (
                        <TouchableOpacity
                          style={[styles.acceptButton, { flex: 1, backgroundColor: '#2563eb' }]}
                          onPress={() => handleOpenAssignModal(intervention.id)}
                        >
                          <Text style={styles.acceptButtonText}>📤 Envoyer à un tech</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* Interventions récentes */}
            {interventions.filter(i => !['completed', 'cancelled', 'paid', 'invoiced'].includes(i.status)).length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>📋 Interventions en cours</Text>
                {interventions
                  .filter(i => !['completed', 'cancelled', 'paid', 'invoiced'].includes(i.status))
                  .filter(i => validatedTechnicians.some(t => t.id === i.technicianId))
                  .slice(0, 5)
                  .map((intervention) => {
                    const tech = validatedTechnicians.find(t => t.id === intervention.technicianId);
                    return (
                      <View key={intervention.id} style={styles.interventionCard}>
                        <View>
                          <View style={styles.interventionHeader}>
                            <View>
                              <Text style={styles.interventionReference}>{intervention.reference}</Text>
                              <Text style={styles.interventionType}>
                                {TYPE_LABELS[intervention.type] || intervention.type}
                              </Text>
                              {tech && <Text style={styles.interventionTech}>Par {tech.name}</Text>}
                            </View>
                            <View style={[
                              styles.statusBadge,
                              { backgroundColor: STATUS_COLORS[intervention.status] || '#6b7280' }
                            ]}>
                              <Text style={styles.statusBadgeText}>
                                {STATUS_LABELS[intervention.status] || intervention.status}
                              </Text>
                            </View>
                          </View>
                          {!['pending', 'notified'].includes(intervention.status) && (intervention.clientName || intervention.client?.name) && (
                            <Text style={styles.interventionClient}>👤 {intervention.clientName || intervention.client?.name}</Text>
                          )}
                          {(intervention.address?.street || intervention.address?.city) && (
                            <Text style={styles.interventionAddress}>📍 {[intervention.address?.street, [intervention.address?.postalCode, intervention.address?.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')}</Text>
                          )}
                          {intervention.amountTTC && (
                            <Text style={styles.interventionAmount}>{formatCurrency(intervention.amountTTC)}</Text>
                          )}
                        </View>
                        {/* Actions rapides */}
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                          {validatedTechnicians.length > 0 && (
                            <TouchableOpacity
                              onPress={() => handleOpenAssignModal(intervention.id)}
                              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8, borderRadius: 8, backgroundColor: '#f3f0ff', borderWidth: 1, borderColor: '#ddd6fe' }}
                            >
                              <Text style={{ fontSize: 14 }}>📤</Text>
                              <Text style={{ fontSize: 11, fontWeight: '600', color: '#2563eb' }}>Transférer</Text>
                            </TouchableOpacity>
                          )}
                          {(intervention.clientPhone || intervention.client?.phone) ? (
                            <TouchableOpacity
                              onPress={() => Linking.openURL(`tel:${intervention.clientPhone || intervention.client?.phone}`)}
                              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8, borderRadius: 8, backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#bbf7d0' }}
                            >
                              <Text style={{ fontSize: 14 }}>📞</Text>
                              <Text style={{ fontSize: 11, fontWeight: '600', color: '#059669' }}>Appeler</Text>
                            </TouchableOpacity>
                          ) : null}
                          {intervention.address?.street ? (
                            <TouchableOpacity
                              onPress={() => openNavigationChoice(intervention.address!, intervention.id)}
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
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
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
                            <Text style={{ fontSize: 11, fontWeight: '600', color: '#2563eb' }}>Facture</Text>
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
                        {['accepted', 'en_route', 'on_site', 'in_progress'].includes(intervention.status) && (
                          <TouchableOpacity
                            onPress={async () => {
                              if (['on_site', 'in_progress'].includes(intervention.status)) {
                                handleOpenCompleteModal(intervention.id);
                              } else if (intervention.status === 'en_route') {
                                try {
                                  await api.updateInterventionStatus(intervention.id, 'on_site');
                                  await loadData();
                                } catch (e: any) {
                                  Alert.alert('Erreur', e.message || 'Impossible de mettre à jour le statut');
                                }
                              } else if (intervention.status === 'accepted') {
                                try {
                                  await api.updateInterventionStatus(intervention.id, 'en_route');
                                  await loadData();
                                } catch (e: any) {
                                  Alert.alert('Erreur', e.message || 'Impossible de mettre à jour le statut');
                                }
                              }
                            }}
                            style={{ marginTop: 6, paddingVertical: 12, borderRadius: 10, backgroundColor: ['on_site', 'in_progress'].includes(intervention.status) ? '#059669' : '#2563eb', alignItems: 'center' }}
                          >
                            <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>
                              {intervention.status === 'accepted' ? '🚗 Démarrer le trajet' :
                               intervention.status === 'en_route' ? '📍 Je suis arrivé' :
                               '✓ Terminer l\'intervention'}
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    );
                  })}
              </View>
            )}

            {/* Récapitulatif des versements */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>💳 Récapitulatif des versements</Text>
              
              {/* Résumé global */}
              <View style={styles.paymentSummaryCard}>
                <View style={styles.paymentSummaryHeader}>
                  <Text style={styles.paymentSummaryTitle}>Bilan financier</Text>
                </View>
                
                <View style={styles.paymentSummaryRow}>
                  <Text style={styles.paymentLabel}>Chiffre d'affaires total</Text>
                  <Text style={styles.paymentValue}>{formatCurrency(stats.totalRevenue || 0)}</Text>
                </View>
                
                <View style={styles.paymentSummaryRow}>
                  <Text style={styles.paymentLabel}>Ma commission ({stats.commissionFromAdmin != null ? `${stats.commissionFromAdmin}%` : '—'})</Text>
                  <Text style={[styles.paymentValue, styles.greenText]}>{formatCurrency((stats.totalRevenue || 0) * ((stats.commissionFromAdmin ?? 0) / 100))}</Text>
                </View>

                <View style={[styles.paymentSummaryRow, styles.paymentSummaryTotal]}>
                  <Text style={styles.paymentTotalLabel}>À recevoir de l'admin</Text>
                  <Text style={[styles.paymentTotalValue, styles.greenText]}>{formatCurrency(stats.totalToReceive || 0)}</Text>
                </View>

                <View style={[styles.paymentSummaryRow, styles.paymentSummaryTotal]}>
                  <Text style={styles.paymentTotalLabel}>À verser aux techniciens</Text>
                  <Text style={[styles.paymentTotalValue, styles.orangeText]}>{formatCurrency(stats.totalToPayTechnicians || 0)}</Text>
                </View>

                <View style={[styles.paymentSummaryRow, styles.paymentSummaryTotal]}>
                  <Text style={styles.paymentTotalLabel}>Profit net</Text>
                  <Text style={[styles.paymentTotalValue, { color: COLORS.primary, fontWeight: '800' }]}>{formatCurrency(stats.netProfit || 0)}</Text>
                </View>
              </View>
              
              {/* Détail par technicien */}
              {(stats.technicianStats || []).length > 0 && (
                <View style={styles.technicianPaymentsCard}>
                  <Text style={styles.technicianPaymentsTitle}>Détail par technicien</Text>

                  {(stats.technicianStats || []).map((techStat) => (
                    <View key={techStat.id} style={styles.technicianPaymentRow}>
                      <View style={styles.technicianPaymentInfo}>
                        <Text style={styles.technicianPaymentName}>{techStat.name}{techStat.isTL ? ' (moi)' : ''}</Text>
                        <Text style={styles.technicianPaymentDetails}>
                          {techStat.interventionsCount} intervention(s) • {techStat.commissionPercentage}% commission
                        </Text>
                      </View>
                      <View style={styles.technicianPaymentAmount}>
                        <Text style={[styles.technicianPaymentValue, techStat.isTL ? styles.greenText : null]}>{formatCurrency(techStat.toPay)}</Text>
                        <Text style={styles.technicianPaymentStatus}>
                          {techStat.toPay > 0 ? (techStat.isTL ? '📥 À recevoir' : '⏳ À verser') : '✓ À jour'}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </View>
          <View style={{ height: 100 }} />
        </ScrollView>
      )}

      {/* ===== VUE MES INTERVENTIONS ===== */}
      {mainView === 'interventions' && (
        <ScrollView
          style={styles.scrollView}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} />
          }
        >
          <View style={styles.content}>
            <Text style={styles.sectionTitle}>🔧 Toutes les interventions</Text>
            {interventions.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>📋</Text>
                <Text style={styles.emptyTitle}>Aucune intervention</Text>
                <Text style={styles.emptySubtitle}>Les interventions apparaîtront ici</Text>
              </View>
            ) : (
              interventions.filter(i => i.status !== 'cancelled').map((intervention) => {
                const tech = validatedTechnicians.find(t => t.id === intervention.technicianId);
                return (
                  <TouchableOpacity
                    key={intervention.id}
                    style={styles.interventionCard}
                    onPress={() => (navigation as any).navigate('InterventionDetail', { interventionId: intervention.id })}
                  >
                    <View style={styles.interventionHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.interventionReference}>{intervention.reference}</Text>
                        <Text style={styles.interventionType}>
                          {TYPE_LABELS[intervention.type] || intervention.type}
                        </Text>
                        {tech && <Text style={styles.interventionTech}>Par {tech.name}</Text>}
                      </View>
                      <View style={[
                        styles.statusBadge,
                        { backgroundColor: STATUS_COLORS[intervention.status] || '#6b7280' }
                      ]}>
                        <Text style={styles.statusBadgeText}>
                          {STATUS_LABELS[intervention.status] || intervention.status}
                        </Text>
                      </View>
                    </View>
                    {!['pending', 'notified'].includes(intervention.status) && (intervention.clientName || intervention.client?.name) && (
                      <Text style={styles.interventionClient}>👤 {intervention.clientName || intervention.client?.name}</Text>
                    )}
                    {(intervention.address?.street || intervention.address?.city) && (
                      <Text style={styles.interventionAddress}>📍 {[intervention.address?.street, [intervention.address?.postalCode, intervention.address?.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')}</Text>
                    )}
                    {intervention.amountTTC != null && Number(intervention.amountTTC) > 0 && (
                      <Text style={styles.interventionAmount}>{formatCurrency(intervention.amountTTC)}</Text>
                    )}
                  </TouchableOpacity>
                );
              })
            )}
          </View>
          <View style={{ height: 100 }} />
        </ScrollView>
      )}

      {/* ===== VUE TECHNICIENS ===== */}
      {mainView === 'technicians' && (
        <ScrollView
          style={styles.scrollView}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} />
          }
        >
          <View style={styles.techniciansHeader}>
            <Text style={styles.techniciansTitle}>Mes techniciens</Text>
            <TouchableOpacity
              style={styles.inviteButton}
              onPress={() => navigation.navigate('InviteTechnician')}
            >
              <Text style={styles.inviteButtonText}>+ Inviter</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.content}>
            {validatedTechnicians.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>👥</Text>
                <Text style={styles.emptyTitle}>Aucun technicien</Text>
                <Text style={styles.emptySubtitle}>
                  Les techniciens apparaîtront ici une fois qu'ils auront accepté vos invitations
                </Text>
                <TouchableOpacity
                  style={styles.emptyButton}
                  onPress={() => navigation.navigate('InviteTechnician')}
                >
                  <Text style={styles.emptyButtonText}>Inviter un technicien</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                {validatedTechnicians.map((tech) => {
                  const techStats = stats.technicianStats?.find((s) => s.id === tech.id);
                  const techInterventions = interventionsByTechnician[tech.id] || [];
                  const activeInterventions = techInterventions.filter(i =>
                    ['accepted', 'en_route', 'on_site'].includes(i.status)
                  );

                  return (
                    <TouchableOpacity
                      key={tech.id}
                      style={styles.technicianCard}
                      onPress={() => navigation.navigate('TechnicianEdit', { technician: tech, teamLeader })}
                    >
                      <View style={styles.techCardHeader}>
                        <View style={styles.techAvatar}>
                          <Text style={styles.techAvatarText}>{getInitials(tech.name)}</Text>
                        </View>
                        <View style={styles.techInfo}>
                          <View style={styles.techNameRow}>
                            <Text style={styles.techName}>{tech.name}</Text>
                            <View style={[
                              styles.availabilityBadge,
                              { backgroundColor: (tech.available || tech.isAvailable) ? '#dcfce7' : '#fee2e2' }
                            ]}>
                              <Text style={[
                                styles.availabilityText,
                                { color: (tech.available || tech.isAvailable) ? '#16a34a' : '#dc2626' }
                              ]}>
                                {(tech.available || tech.isAvailable) ? 'Disponible' : 'Occupé'}
                              </Text>
                            </View>
                          </View>
                          <Text style={styles.techDetail}>📞 {tech.phone || 'Non renseigné'}</Text>
                          <Text style={styles.techDetail}>✉️ {tech.email}</Text>
                          
                          {techStats && (
                            <View style={styles.techStatsRow}>
                              <Text style={styles.techStatItem}>{techStats.interventionsCount} interventions</Text>
                              <Text style={styles.techStatItem}>CA: {formatCurrency(techStats.revenue)}</Text>
                              <Text style={[styles.techStatItem, styles.greenText]}>
                                À verser: {formatCurrency(techStats.toPay)}
                              </Text>
                            </View>
                          )}

                          {activeInterventions.length > 0 && (
                            <View style={styles.activeInterventions}>
                              <Text style={styles.activeInterventionsTitle}>
                                Interventions en cours:
                              </Text>
                              {activeInterventions.slice(0, 2).map(int => (
                                <Text key={int.id} style={styles.activeInterventionItem}>
                                  • {int.reference} - {STATUS_LABELS[int.status]}
                                </Text>
                              ))}
                              {activeInterventions.length > 2 && (
                                <Text style={styles.moreInterventions}>
                                  +{activeInterventions.length - 2} autre(s)
                                </Text>
                              )}
                            </View>
                          )}
                        </View>
                        <TouchableOpacity
                          style={styles.commissionButton}
                          onPress={() => {
                            setEditingCommission(tech.id);
                            setCommissionValue(String(tech.commissionPercentage || 30));
                          }}
                        >
                          <Text style={styles.commissionButtonText}>
                            {tech.commissionPercentage || 30}%
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </TouchableOpacity>
                  );
                })}

                {/* Tableau récapitulatif */}
                {stats.technicianStats && stats.technicianStats.length > 0 && (
                  <View style={styles.recapCard}>
                    <Text style={styles.recapTitle}>Récapitulatif des reversements</Text>
                    <View style={styles.recapTable}>
                      <View style={styles.recapHeader}>
                        <Text style={[styles.recapCell, styles.recapHeaderText, { flex: 2 }]}>Tech.</Text>
                        <Text style={[styles.recapCell, styles.recapHeaderText]}>Int.</Text>
                        <Text style={[styles.recapCell, styles.recapHeaderText]}>CA</Text>
                        <Text style={[styles.recapCell, styles.recapHeaderText]}>%</Text>
                        <Text style={[styles.recapCell, styles.recapHeaderText]}>À verser</Text>
                      </View>
                      {stats.technicianStats.map((ts) => (
                        <View key={ts.id} style={styles.recapRow}>
                          <Text style={[styles.recapCell, { flex: 2 }]} numberOfLines={1}>{ts.name}</Text>
                          <Text style={styles.recapCell}>{ts.interventionsCount}</Text>
                          <Text style={styles.recapCell}>{formatCurrency(ts.revenue)}</Text>
                          <Text style={styles.recapCell}>{ts.commissionPercentage}%</Text>
                          <Text style={[styles.recapCell, styles.greenText]}>{formatCurrency(ts.toPay)}</Text>
                        </View>
                      ))}
                      <View style={[styles.recapRow, styles.recapTotal]}>
                        <Text style={[styles.recapCell, styles.recapTotalText, { flex: 4 }]}>Total à verser</Text>
                        <Text style={[styles.recapCell, styles.recapTotalText, styles.greenText]}>
                          {formatCurrency(stats.totalToPayTechnicians)}
                        </Text>
                      </View>
                      <View style={[styles.recapRow, styles.recapProfit]}>
                        <Text style={[styles.recapCell, styles.recapProfitText, { flex: 4 }]}>
                          Votre profit net
                        </Text>
                        <Text style={[styles.recapCell, styles.recapProfitText, styles.purpleText]}>
                          {formatCurrency(stats.netProfit)}
                        </Text>
                      </View>
                    </View>
                  </View>
                )}
              </>
            )}
          </View>
          <View style={{ height: 100 }} />
        </ScrollView>
      )}

      {/* ===== VUE PARAMÈTRES ===== */}
      {mainView === 'settings' && (
        <ScrollView
          style={styles.scrollView}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} />
          }
        >
          <View style={styles.settingsHeader}>
            <Text style={styles.settingsTitle}>Paramètres</Text>
          </View>

          <View style={styles.content}>
            {/* Ma configuration - valeurs définies par l'admin lors de la génération du code d'invitation */}
            <View style={styles.invitationConfigHeader}>
              <Text style={styles.invitationConfigTitle}>📋 Ma configuration</Text>
            </View>

            {/* Profil */}
            <View style={styles.settingsCard}>
              <View style={styles.profileSection}>
                <View style={styles.profileAvatar}>
                  <Text style={styles.profileAvatarText}>
                    {teamLeader?.name ? getInitials(teamLeader.name) : 'TL'}
                  </Text>
                </View>
                <View style={styles.profileInfo}>
                  <Text style={styles.profileName}>{teamLeader?.name}</Text>
                  <Text style={styles.profileEmail}>{teamLeader?.email}</Text>
                  {teamLeader?.phone && (
                    <Text style={styles.profilePhone}>{teamLeader.phone}</Text>
                  )}
                </View>
              </View>
              {editingName ? (
                <View style={{ marginTop: 12 }}>
                  <TextInput
                    style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 16, color: '#111827', backgroundColor: '#f9fafb' }}
                    value={newName}
                    onChangeText={setNewName}
                    placeholder="Votre nom"
                    autoFocus
                  />
                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                    <TouchableOpacity
                      onPress={() => setEditingName(false)}
                      style={{ flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: '#f3f4f6', alignItems: 'center' }}
                    >
                      <Text style={{ fontSize: 14, fontWeight: '600', color: '#6b7280' }}>Annuler</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={handleSaveName}
                      disabled={savingName}
                      style={{ flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: COLORS.primary, alignItems: 'center' }}
                    >
                      {savingName ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={{ fontSize: 14, fontWeight: '600', color: '#fff' }}>Enregistrer</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <TouchableOpacity
                  onPress={() => { setNewName(teamLeader?.name || ''); setEditingName(true); }}
                  style={{ marginTop: 12, alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe' }}
                >
                  <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.primary }}>✏️ Modifier le nom</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Commission reçue */}
            <View style={styles.settingsCard}>
              <Text style={styles.settingsLabel}>Commission reçue</Text>
              <View style={[
                styles.commissionInfoCard,
                { backgroundColor: teamLeader?.billingType === 'self' ? '#f0fdf4' : '#eff6ff' }
              ]}>
                <Text style={[
                  styles.commissionValue,
                  { color: teamLeader?.billingType === 'self' ? '#16a34a' : '#2563eb' }
                ]}>
                  {teamLeader?.commissionFromAdmin != null ? `${teamLeader.commissionFromAdmin}%` : '—'}
                </Text>
                <Text style={[
                  styles.commissionDescription,
                  { color: teamLeader?.billingType === 'self' ? '#15803d' : '#1d4ed8' }
                ]}>
                  {teamLeader?.billingType === 'self' 
                    ? 'du (HT - matériel)'
                    : 'du montant HT facturé'
                  }
                </Text>
              </View>
              {teamLeader?.billingType === 'self' && teamLeader?.commissionFromAdmin != null ? (
                <Text style={styles.commissionExample}>
                  💡 Ex: Facture 1000€ HT, Matériel 200€ → Vous recevez {((1000 - 200) * (teamLeader.commissionFromAdmin) / 100).toFixed(0)}€
                </Text>
              ) : teamLeader?.billingType !== 'self' && teamLeader?.commissionFromAdmin != null ? (
                <Text style={styles.commissionExample}>
                  💡 Ex: Facture 1000€ HT → Vous recevez {(1000 * (teamLeader.commissionFromAdmin) / 100).toFixed(0)}€
                </Text>
              ) : null}
            </View>

            {/* Commission techniciens */}
            <View style={styles.settingsCard}>
              <Text style={styles.settingsLabel}>Commission par défaut pour techniciens</Text>
              <View style={[styles.commissionInfoCard, { backgroundColor: '#f0fdf4' }]}>
                <Text style={[styles.commissionValue, { color: '#16a34a' }]}>
                  {teamLeader?.defaultTechnicianCommission != null ? `${teamLeader.defaultTechnicianCommission}%` : '20%'}
                </Text>
                <Text style={[styles.commissionDescription, { color: '#15803d' }]}>
                  sur chaque intervention terminée
                </Text>
              </View>
              <Text style={styles.commissionExample}>
                💡 Modifiable par technicien lors de la génération du code d'invitation
              </Text>
            </View>

            {/* Type de facturation */}
            <View style={styles.settingsCard}>
              <Text style={styles.settingsLabel}>Type de facturation</Text>
              <View style={styles.billingTypeContainer}>
                <View style={[
                  styles.billingTypeBadge,
                  { backgroundColor: teamLeader?.billingType === 'self' ? '#dcfce7' : '#dbeafe' }
                ]}>
                  <Text style={[
                    styles.billingTypeBadgeText,
                    { color: teamLeader?.billingType === 'self' ? '#16a34a' : '#2563eb' }
                  ]}>
                    {teamLeader?.billingType === 'self' 
                      ? '💼 Auto-facturation'
                      : teamLeader?.billingType === 'platform'
                      ? '🏢 Facturation plateforme'
                      : teamLeader?.billingType === 'spcp'
                      ? '🏢 Facturation SPCP'
                      : '🏢 Facturation plateforme'
                    }
                  </Text>
                </View>
                <Text style={styles.billingTypeDescription}>
                  {teamLeader?.billingType === 'self' 
                    ? 'Vous facturez directement vos clients'
                    : 'La plateforme facture le client pour vous'
                  }
                </Text>
              </View>
            </View>

            {/* === SECTION AUTO-FACTURATION === */}
            {teamLeader?.billingType === 'self' && (
              <>
                {/* Titre section */}
                <View style={styles.sectionDivider}>
                  <Text style={styles.sectionDividerText}>📄 Personnalisation documents</Text>
                </View>

                {/* Personnalisation Devis & Factures */}
                <TouchableOpacity 
                  style={styles.settingsCardAction}
                  onPress={() => navigation.navigate('DocumentSettings')}
                >
                  <View style={styles.settingsCardActionIcon}>
                    <Text style={styles.settingsCardActionEmoji}>📋</Text>
                  </View>
                  <View style={styles.settingsCardActionContent}>
                    <Text style={styles.settingsCardActionTitle}>Devis & Factures</Text>
                    <Text style={styles.settingsCardActionSubtitle}>
                      Logo, infos entreprise, mentions légales
                    </Text>
                  </View>
                  <Text style={styles.settingsCardActionArrow}>›</Text>
                </TouchableOpacity>

                {/* Signature email */}
                <TouchableOpacity 
                  style={styles.settingsCardAction}
                  onPress={() => navigation.navigate('EmailSettings')}
                >
                  <View style={styles.settingsCardActionIcon}>
                    <Text style={styles.settingsCardActionEmoji}>✉️</Text>
                  </View>
                  <View style={styles.settingsCardActionContent}>
                    <Text style={styles.settingsCardActionTitle}>Signature email</Text>
                    <Text style={styles.settingsCardActionSubtitle}>
                      Personnalisez vos emails automatiques
                    </Text>
                  </View>
                  <Text style={styles.settingsCardActionArrow}>›</Text>
                </TouchableOpacity>

                {/* Paiement SumUp */}
                <TouchableOpacity 
                  style={styles.settingsCardAction}
                  onPress={() => navigation.navigate('SumUpSettings')}
                >
                  <View style={[styles.settingsCardActionIcon, { backgroundColor: '#e0f2fe' }]}>
                    <Text style={styles.settingsCardActionEmoji}>💳</Text>
                  </View>
                  <View style={styles.settingsCardActionContent}>
                    <Text style={styles.settingsCardActionTitle}>Paiement SumUp</Text>
                    <Text style={styles.settingsCardActionSubtitle}>
                      Liens de paiement dans vos devis et factures
                    </Text>
                  </View>
                  <Text style={styles.settingsCardActionArrow}>›</Text>
                </TouchableOpacity>

                {/* Titre section devis/factures */}
                <View style={styles.sectionDivider}>
                  <Text style={styles.sectionDividerText}>💰 Facturation</Text>
                </View>

                {/* Créer un devis */}
                <TouchableOpacity 
                  style={styles.settingsCardAction}
                  onPress={() => navigation.navigate('CreateQuote')}
                >
                  <View style={[styles.settingsCardActionIcon, { backgroundColor: '#fef3c7' }]}>
                    <Text style={styles.settingsCardActionEmoji}>📝</Text>
                  </View>
                  <View style={styles.settingsCardActionContent}>
                    <Text style={styles.settingsCardActionTitle}>Créer un devis</Text>
                    <Text style={styles.settingsCardActionSubtitle}>
                      Générer un devis pour un client
                    </Text>
                  </View>
                  <Text style={styles.settingsCardActionArrow}>›</Text>
                </TouchableOpacity>

                {/* Créer une facture */}
                <TouchableOpacity 
                  style={styles.settingsCardAction}
                  onPress={() => navigation.navigate('CreateInvoice')}
                >
                  <View style={[styles.settingsCardActionIcon, { backgroundColor: '#dcfce7' }]}>
                    <Text style={styles.settingsCardActionEmoji}>🧾</Text>
                  </View>
                  <View style={styles.settingsCardActionContent}>
                    <Text style={styles.settingsCardActionTitle}>Créer une facture</Text>
                    <Text style={styles.settingsCardActionSubtitle}>
                      Générer une facture pour un client
                    </Text>
                  </View>
                  <Text style={styles.settingsCardActionArrow}>›</Text>
                </TouchableOpacity>

                {/* Mes documents */}
                <TouchableOpacity 
                  style={styles.settingsCardAction}
                  onPress={() => navigation.navigate('MyDocuments')}
                >
                  <View style={[styles.settingsCardActionIcon, { backgroundColor: '#e0e7ff' }]}>
                    <Text style={styles.settingsCardActionEmoji}>📁</Text>
                  </View>
                  <View style={styles.settingsCardActionContent}>
                    <Text style={styles.settingsCardActionTitle}>Mes documents</Text>
                    <Text style={styles.settingsCardActionSubtitle}>
                      Historique devis et factures
                    </Text>
                  </View>
                  <Text style={styles.settingsCardActionArrow}>›</Text>
                </TouchableOpacity>

                {/* Paramètres de facturation supprimé - intégré dans Personnalisation documents */}
              </>
            )}

            {teamLeader?.billingType !== 'self' && (
              <View style={styles.spcpInfoCard}>
                <Text style={styles.spcpInfoTitle}>ℹ️ Facturation plateforme</Text>
                <Text style={styles.spcpInfoText}>
                  La plateforme gère la facturation pour vous. Les devis et factures sont générés automatiquement.
                </Text>
              </View>
            )}

            {/* Titre section techniciens */}
            <View style={styles.sectionDivider}>
              <Text style={styles.sectionDividerText}>👥 Paramètres techniciens</Text>
            </View>

            {/* Pré-configuration techniciens */}
            <TouchableOpacity 
              style={styles.settingsCardAction}
              onPress={() => navigation.navigate('TechnicianDefaults')}
            >
              <View style={[styles.settingsCardActionIcon, { backgroundColor: '#f3e8ff' }]}>
                <Text style={styles.settingsCardActionEmoji}>⚙️</Text>
              </View>
              <View style={styles.settingsCardActionContent}>
                <Text style={styles.settingsCardActionTitle}>Paramètres par défaut</Text>
                <Text style={styles.settingsCardActionSubtitle}>
                  Commission, secteurs pour nouveaux techniciens
                </Text>
              </View>
              <Text style={styles.settingsCardActionArrow}>›</Text>
            </TouchableOpacity>

            {/* Secteurs sélectionnés (paramètres de la bulle verte - configurés par l'admin) */}
            <View style={styles.settingsCard}>
              <Text style={styles.settingsLabel}>Secteurs d'intervention</Text>
              <View style={styles.departmentsContainer}>
                {teamLeader?.selectedDepartments?.map(dept => (
                  <View key={dept} style={styles.departmentBadge}>
                    <Text style={styles.departmentText}>{dept}</Text>
                  </View>
                ))}
                {(!teamLeader?.selectedDepartments || teamLeader.selectedDepartments.length === 0) && (
                  <Text style={styles.noDepartments}>Aucun secteur sélectionné</Text>
                )}
              </View>
            </View>

            {/* Activités (paramètres de la bulle verte - configurées par l'admin) */}
            <View style={styles.settingsCard}>
              <Text style={styles.settingsLabel}>Activités / Spécialités</Text>
              <View style={styles.departmentsContainer}>
                {teamLeader?.activityIds?.map(id => (
                  <View key={id} style={[styles.departmentBadge, styles.activityBadge]}>
                    <Text style={styles.departmentText}>
                      {activityNames[id] || id}
                    </Text>
                  </View>
                ))}
                {(!teamLeader?.activityIds || teamLeader.activityIds.length === 0) && (
                  <Text style={styles.noDepartments}>Aucune activité sélectionnée</Text>
                )}
              </View>
            </View>

            {/* Bouton déconnexion */}
            <TouchableOpacity style={styles.logoutButton} onPress={logout}>
              <Text style={styles.logoutButtonText}>Se déconnecter</Text>
            </TouchableOpacity>
          </View>
          <View style={{ height: 100 }} />
        </ScrollView>
      )}

      {/* Bottom Navigation */}
      <View style={styles.bottomNav}>
        <TouchableOpacity
          style={styles.bottomNavItem}
          onPress={() => setMainView('stats')}
        >
          <Text style={[styles.bottomNavIcon, mainView === 'stats' && styles.activeNavIcon]}>
            🏠
          </Text>
          <Text style={[styles.bottomNavText, mainView === 'stats' && styles.activeNavText]}>
            Accueil
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.bottomNavItem}
          onPress={() => setMainView('interventions')}
        >
          <Text style={[styles.bottomNavIcon, mainView === 'interventions' && styles.activeNavIcon]}>
            🔧
          </Text>
          <Text style={[styles.bottomNavText, mainView === 'interventions' && styles.activeNavText]}>
            Mes Inters
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.bottomNavItem}
          onPress={() => (navigation as any).navigate('Messaging')}
        >
          <View style={styles.bottomNavIconContainer}>
            <Text style={[styles.bottomNavIcon]}>
              💬
            </Text>
            {unreadMessagesCount > 0 && (
              <View style={[styles.badge, { backgroundColor: '#ef4444' }]}>
                <Text style={styles.badgeText}>
                  {unreadMessagesCount > 99 ? '99+' : unreadMessagesCount}
                </Text>
              </View>
            )}
          </View>
          <Text style={[styles.bottomNavText]}>
            Messages
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.bottomNavItem}
          onPress={() => setMainView('settings')}
        >
          <Text style={[styles.bottomNavIcon, mainView === 'settings' && styles.activeNavIcon]}>
            👤
          </Text>
          <Text style={[styles.bottomNavText, mainView === 'settings' && styles.activeNavText]}>
            Profil
          </Text>
        </TouchableOpacity>
      </View>

      {/* Modal Technicien détail */}
      <Modal
        visible={!!selectedTechnician}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setSelectedTechnician(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {selectedTechnician && (
              <>
                <View style={styles.modalHeader}>
                  <View style={styles.modalAvatar}>
                    <Text style={styles.modalAvatarText}>
                      {getInitials(selectedTechnician.name)}
                    </Text>
                  </View>
                  <Text style={styles.modalName}>{selectedTechnician.name}</Text>
                  <Text style={styles.modalEmail}>{selectedTechnician.email}</Text>
                  <TouchableOpacity
                    style={styles.modalCloseButton}
                    onPress={() => setSelectedTechnician(null)}
                  >
                    <Text style={styles.modalCloseText}>✕</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.modalBody}>
                  <View style={styles.modalRow}>
                    <Text style={styles.modalLabel}>Téléphone</Text>
                    <Text style={styles.modalValue}>{selectedTechnician.phone || 'Non renseigné'}</Text>
                  </View>
                  <View style={styles.modalRow}>
                    <Text style={styles.modalLabel}>Statut</Text>
                    <View style={[
                      styles.modalStatusBadge,
                      { backgroundColor: (selectedTechnician.available || selectedTechnician.isAvailable) ? '#dcfce7' : '#fee2e2' }
                    ]}>
                      <Text style={[
                        styles.modalStatusText,
                        { color: (selectedTechnician.available || selectedTechnician.isAvailable) ? '#16a34a' : '#dc2626' }
                      ]}>
                        {(selectedTechnician.available || selectedTechnician.isAvailable) ? 'Disponible' : 'Occupé'}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.modalRow}>
                    <Text style={styles.modalLabel}>Commission</Text>
                    {editingCommission === selectedTechnician.id ? (
                      <View style={styles.commissionEdit}>
                        <TextInput
                          style={styles.commissionInput}
                          value={commissionValue}
                          onChangeText={setCommissionValue}
                          keyboardType="numeric"
                          maxLength={3}
                        />
                        <Text style={styles.commissionPercent}>%</Text>
                        <TouchableOpacity
                          style={styles.commissionSave}
                          onPress={() => handleSaveCommission(selectedTechnician.id)}
                          disabled={savingCommission}
                        >
                          <Text style={styles.commissionSaveText}>
                            {savingCommission ? '...' : '✓'}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.commissionCancel}
                          onPress={() => setEditingCommission(null)}
                        >
                          <Text style={styles.commissionCancelText}>✕</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={styles.editCommissionButton}
                        onPress={() => {
                          setEditingCommission(selectedTechnician.id);
                          setCommissionValue(String(selectedTechnician.commissionPercentage || 30));
                        }}
                      >
                        <Text style={styles.editCommissionText}>
                          {selectedTechnician.commissionPercentage || 30}% ✏️
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  {selectedTechnician.specialties && selectedTechnician.specialties.length > 0 && (
                    <View style={styles.modalRow}>
                      <Text style={styles.modalLabel}>Spécialités</Text>
                      <View style={styles.specialtiesContainer}>
                        {selectedTechnician.specialties.map((spec, idx) => (
                          <View key={idx} style={styles.specialtyBadge}>
                            <Text style={styles.specialtyText}>{spec}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Modal Édition commission */}
      <Modal
        visible={editingCommission !== null && selectedTechnician === null}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setEditingCommission(null)}
      >
        <View style={styles.commissionModalOverlay}>
          <View style={styles.commissionModalContent}>
            <Text style={styles.commissionModalTitle}>Modifier la commission</Text>
            <View style={styles.commissionModalInput}>
              <TextInput
                style={styles.commissionModalTextInput}
                value={commissionValue}
                onChangeText={setCommissionValue}
                keyboardType="numeric"
                maxLength={3}
              />
              <Text style={styles.commissionModalPercent}>%</Text>
            </View>
            <View style={styles.commissionModalButtons}>
              <TouchableOpacity
                style={styles.commissionModalCancel}
                onPress={() => setEditingCommission(null)}
              >
                <Text style={styles.commissionModalCancelText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.commissionModalSave}
                onPress={() => editingCommission && handleSaveCommission(editingCommission)}
                disabled={savingCommission}
              >
                <Text style={styles.commissionModalSaveText}>
                  {savingCommission ? 'Sauvegarde...' : 'Sauvegarder'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal Techniciens */}
      <Modal
        visible={showTechniciansModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowTechniciansModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>👥 Mes techniciens</Text>
              <TouchableOpacity onPress={() => setShowTechniciansModal(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody}>
              {validatedTechnicians.length === 0 ? (
                <Text style={styles.modalEmptyText}>Aucun technicien dans l'équipe</Text>
              ) : (
                validatedTechnicians.map((tech) => {
                  const techInterventions = interventions.filter(i => i.technicianId === tech.id);
                  const completedCount = techInterventions.filter(i => i.status === 'completed').length;
                  return (
                    <View key={tech.id} style={styles.modalListItem}>
                      <View style={styles.modalItemHeader}>
                        <Text style={styles.modalItemTitle}>{tech.name}</Text>
                        <View style={[styles.modalBadge, tech.isAvailable ? styles.badgeGreen : styles.badgeGray]}>
                          <Text style={styles.modalBadgeText}>
                            {tech.isAvailable ? 'Disponible' : 'Indisponible'}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.modalItemSubtitle}>{tech.email}</Text>
                      <View style={styles.modalItemStats}>
                        <Text style={styles.modalItemStat}>📊 {completedCount} terminées</Text>
                        <Text style={styles.modalItemStat}>💰 {tech.commissionPercentage || 30}% commission</Text>
                      </View>
                    </View>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Modal Interventions */}
      <Modal
        visible={showInterventionsModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowInterventionsModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>📋 Toutes les interventions</Text>
              <TouchableOpacity onPress={() => setShowInterventionsModal(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody}>
              <View style={styles.modalSummary}>
                <View style={styles.modalSummaryItem}>
                  <Text style={styles.modalSummaryNumber}>{stats.completedInterventions}</Text>
                  <Text style={styles.modalSummaryLabel}>Terminées</Text>
                </View>
                <View style={styles.modalSummaryItem}>
                  <Text style={styles.modalSummaryNumber}>{interventions.filter(i => ['accepted', 'en_route', 'on_site'].includes(i.status)).length}</Text>
                  <Text style={styles.modalSummaryLabel}>En cours</Text>
                </View>
                <View style={styles.modalSummaryItem}>
                  <Text style={styles.modalSummaryNumber}>{availableInterventions.length}</Text>
                  <Text style={styles.modalSummaryLabel}>En attente</Text>
                </View>
              </View>
              {interventions.slice(0, 10).map((intervention) => (
                <TouchableOpacity 
                  key={intervention.id} 
                  style={styles.modalListItem}
                  onPress={() => {
                    setShowInterventionsModal(false);
                    navigation.navigate('InterventionDetail', { interventionId: intervention.id });
                  }}
                >
                  <View style={styles.modalItemHeader}>
                    <Text style={styles.modalItemTitle}>{intervention.reference}</Text>
                    <View style={[styles.modalBadge, { backgroundColor: STATUS_COLORS[intervention.status] || '#6b7280' }]}>
                      <Text style={styles.modalBadgeText}>{STATUS_LABELS[intervention.status]}</Text>
                    </View>
                  </View>
                  <Text style={styles.modalItemSubtitle}>{TYPE_LABELS[intervention.type] || intervention.type}</Text>
                  <Text style={styles.modalItemAmount}>
                    {formatCurrency(parseFloat(String(intervention.amountTTC)) || 0)}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Modal Chiffre d'affaires */}
      <Modal
        visible={showRevenueModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowRevenueModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>💰 Détail du chiffre d'affaires</Text>
              <TouchableOpacity onPress={() => setShowRevenueModal(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody}>
              <View style={styles.revenueCard}>
                <Text style={styles.revenueBigNumber}>{formatCurrency(stats.totalRevenue || 0)}</Text>
                <Text style={styles.revenueSubtitle}>Chiffre d'affaires total</Text>
              </View>
              
              <View style={styles.revenueBreakdown}>
                <Text style={styles.revenueBreakdownTitle}>Répartition par intervention</Text>
                {interventions
                  .filter(i => i.status === 'completed' || i.status === 'invoiced')
                  .map((intervention) => (
                    <View key={intervention.id} style={styles.revenueItem}>
                      <View>
                        <Text style={styles.revenueItemRef}>{intervention.reference}</Text>
                        <Text style={styles.revenueItemType}>{TYPE_LABELS[intervention.type] || intervention.type}</Text>
                      </View>
                      <Text style={styles.revenueItemAmount}>
                        {formatCurrency(parseFloat(String(intervention.amountTTC)) || 0)}
                      </Text>
                    </View>
                  ))}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Modal Profit net */}
      <Modal
        visible={showProfitModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowProfitModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>📈 Bilan financier détaillé</Text>
              <TouchableOpacity onPress={() => setShowProfitModal(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody}>
              <View style={styles.profitCard}>
                <View style={styles.profitRow}>
                  <Text style={styles.profitLabel}>Chiffre d'affaires total</Text>
                  <Text style={styles.profitValue}>{formatCurrency(stats.totalRevenue || 0)}</Text>
                </View>
                <View style={styles.profitRow}>
                  <Text style={styles.profitLabel}>Ma commission ({stats.commissionFromAdmin != null ? `${stats.commissionFromAdmin}%` : '—'})</Text>
                  <Text style={[styles.profitValue, styles.profitGreen]}>
                    {formatCurrency((stats.totalRevenue || 0) * ((stats.commissionFromAdmin ?? 0) / 100))}
                  </Text>
                </View>
                <View style={styles.profitDivider} />
                <View style={styles.profitRow}>
                  <Text style={styles.profitLabel}>À recevoir de l'admin</Text>
                  <Text style={[styles.profitValue, styles.profitGreen]}>
                    {formatCurrency(stats.totalToReceive || 0)}
                  </Text>
                </View>
                <View style={styles.profitDivider} />
                <View style={styles.profitRow}>
                  <Text style={styles.profitLabel}>À verser aux techniciens</Text>
                  <Text style={[styles.profitValue, styles.profitOrange]}>
                    - {formatCurrency(stats.totalToPayTechnicians || 0)}
                  </Text>
                </View>
                <View style={styles.profitDivider} />
                <View style={styles.profitRow}>
                  <Text style={styles.profitLabelBold}>Profit net</Text>
                  <Text style={styles.profitValueBold}>{formatCurrency(stats.netProfit || 0)}</Text>
                </View>
              </View>

              <Text style={styles.profitSectionTitle}>Détail par technicien</Text>
              {validatedTechnicians.map((tech) => {
                const techInterventions = interventions.filter(i => 
                  i.technicianId === tech.id && (i.status === 'completed' || i.status === 'invoiced')
                );
                const techRevenue = techInterventions.reduce((sum, i) => 
                  sum + (parseFloat(String(i.amountTTC)) || 0), 0
                );
                const techCommission = parseFloat(String(tech.commissionPercentage)) || 30;
                const techToPay = techRevenue * (techCommission / 100);

                return (
                  <View key={tech.id} style={styles.techProfitItem}>
                    <View style={styles.techProfitHeader}>
                      <Text style={styles.techProfitName}>{tech.name}</Text>
                      <Text style={styles.techProfitCommission}>{techCommission}%</Text>
                    </View>
                    <View style={styles.techProfitDetails}>
                      <Text style={styles.techProfitText}>
                        {techInterventions.length} intervention(s) • CA: {formatCurrency(techRevenue)}
                      </Text>
                      <Text style={styles.techProfitToPay}>À verser: {formatCurrency(techToPay)}</Text>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Modale d'assignation intervention → technicien */}
      <Modal visible={showAssignModal} transparent animationType="slide" onRequestClose={() => setShowAssignModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '60%', paddingBottom: 30 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' }}>
              <Text style={{ fontSize: 18, fontWeight: '700', color: '#111827' }}>📤 Envoyer à un technicien</Text>
              <TouchableOpacity onPress={() => setShowAssignModal(false)}>
                <Text style={{ fontSize: 22, color: '#6b7280' }}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={{ padding: 16 }}>
              {validatedTechnicians.length === 0 ? (
                <Text style={{ textAlign: 'center', color: '#9ca3af', padding: 20 }}>Aucun technicien dans votre équipe</Text>
              ) : (
                validatedTechnicians.map(tech => (
                  <TouchableOpacity
                    key={tech.id}
                    onPress={() => handleAssignToTech(tech.id)}
                    disabled={assigning}
                    style={{ flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 12, backgroundColor: '#f9fafb', marginBottom: 8, borderWidth: 1, borderColor: '#e5e7eb' }}
                  >
                    <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#2563eb', justifyContent: 'center', alignItems: 'center', marginRight: 12 }}>
                      <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>{(tech.name || '?')[0].toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: '600', color: '#111827' }}>{tech.name}</Text>
                      {tech.phone && <Text style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>📞 {tech.phone}</Text>}
                      {tech.commissionPercentage !== undefined && (
                        <Text style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>Commission : {tech.commissionPercentage}%</Text>
                      )}
                    </View>
                    {assigning ? (
                      <ActivityIndicator size="small" color="#2563eb" />
                    ) : (
                      <Text style={{ fontSize: 20 }}>➤</Text>
                    )}
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

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
  scrollView: {
    flex: 1,
  },
  header: {
    backgroundColor: '#ffffff',
    paddingTop: 10,
    paddingBottom: 20,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 15,
  },
  userName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  userRole: {
    fontSize: 13,
    color: COLORS.textMuted,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  headerButton: {
    padding: 10,
    borderRadius: 20,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  headerButtonIcon: {
    fontSize: 18,
    color: COLORS.textMuted,
  },
  content: {
    padding: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    width: (SCREEN_WIDTH - 44) / 2,
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  blueCard: {
    backgroundColor: '#ffffff',
  },
  greenCard: {
    backgroundColor: '#ffffff',
  },
  yellowCard: {
    backgroundColor: '#fefce8',
  },
  purpleCard: {
    backgroundColor: '#ffffff',
  },
  statIcon: {
    fontSize: 24,
    marginBottom: 8,
  },
  statNumber: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  smallerNumber: {
    fontSize: 20,
  },
  profitNumber: {
    color: '#22c55e',
  },
  statLabel: {
    fontSize: 13,
    color: COLORS.text,
    marginTop: 4,
    fontWeight: '500',
  },
  statSublabel: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  orangeText: {
    color: '#f97316',
  },
  section: {
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 12,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: -8,
    marginBottom: 12,
  },
  availableCard: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  availableCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  availableCardInfo: {
    flex: 1,
  },
  availableReference: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  availableType: {
    fontSize: 14,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  availableAddress: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginTop: 4,
  },
  availableAmount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.success,
  },
  acceptButton: {
    backgroundColor: '#2563eb',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  acceptButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  interventionCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  interventionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  interventionReference: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  interventionType: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  interventionTech: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 4,
    fontStyle: 'italic',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  interventionClient: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginTop: 4,
  },
  interventionAddress: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginTop: 4,
  },
  interventionAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.success,
    marginTop: 8,
  },
  // Technicians view
  techniciansHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  techniciansTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  inviteButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  inviteButtonText: {
    color: '#fff',
    fontWeight: '600',
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
    textAlign: 'center',
    paddingHorizontal: 32,
    marginBottom: 24,
  },
  emptyButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  emptyButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  technicianCard: {
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
  techCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  techAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  techAvatarText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  techInfo: {
    flex: 1,
  },
  techNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  techName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  availabilityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  availabilityText: {
    fontSize: 11,
    fontWeight: '600',
  },
  techDetail: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  techStatsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 8,
  },
  techStatItem: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  greenText: {
    color: '#22c55e',
    fontWeight: '600',
  },
  purpleText: {
    color: '#2563eb',
    fontWeight: '600',
  },
  activeInterventions: {
    marginTop: 8,
    padding: 8,
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
  },
  activeInterventionsTitle: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginBottom: 4,
  },
  activeInterventionItem: {
    fontSize: 12,
    color: COLORS.text,
  },
  moreInterventions: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  commissionButton: {
    backgroundColor: '#eff6ff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  commissionButtonText: {
    color: COLORS.primary,
    fontWeight: '600',
    fontSize: 14,
  },
  recapCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 16,
    marginTop: 20,
  },
  recapTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 12,
  },
  recapTable: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    overflow: 'hidden',
  },
  recapHeader: {
    flexDirection: 'row',
    backgroundColor: '#f8fafc',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingVertical: 8,
  },
  recapHeaderText: {
    fontWeight: '600',
    fontSize: 11,
  },
  recapRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingVertical: 8,
  },
  recapCell: {
    flex: 1,
    paddingHorizontal: 6,
    fontSize: 11,
    color: COLORS.text,
    textAlign: 'center',
  },
  recapTotal: {
    backgroundColor: '#f8fafc',
  },
  recapTotalText: {
    fontWeight: '600',
  },
  recapProfit: {
    backgroundColor: '#f5f3ff',
    borderBottomWidth: 0,
  },
  recapProfitText: {
    fontWeight: '600',
  },
  // Settings view
  settingsHeader: {
    backgroundColor: COLORS.card,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  settingsTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  errorFullScreen: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorFullScreenIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  errorFullScreenTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 12,
    textAlign: 'center',
  },
  errorFullScreenMessage: {
    fontSize: 15,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  errorFullScreenRetryButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 12,
    minWidth: 200,
    alignItems: 'center',
  },
  errorFullScreenRetryText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  errorFullScreenLogoutButton: {
    paddingVertical: 12,
  },
  errorFullScreenLogoutText: {
    color: COLORS.textMuted,
    fontSize: 14,
  },
  errorBanner: {
    backgroundColor: '#fee2e2',
    marginHorizontal: 16,
    marginTop: 16,
    padding: 16,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 12,
  },
  errorBannerText: {
    flex: 1,
    color: COLORS.danger,
    fontSize: 14,
    fontWeight: '500',
  },
  retryButton: {
    backgroundColor: COLORS.danger,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  invitationConfigHeader: {
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  invitationConfigTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 4,
  },
  invitationConfigSubtitle: {
    fontSize: 13,
    color: COLORS.textMuted,
    lineHeight: 18,
  },
  settingsCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  profileSection: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  profileAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  profileAvatarText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 24,
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  profileEmail: {
    fontSize: 14,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  profilePhone: {
    fontSize: 14,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  settingsLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 4,
  },
  settingsValue: {
    fontSize: 14,
    color: COLORS.textMuted,
  },
  commissionInfoCard: {
    flexDirection: 'row',
    alignItems: 'baseline',
    padding: 12,
    borderRadius: 10,
    marginTop: 8,
    gap: 8,
  },
  commissionValue: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  commissionDescription: {
    fontSize: 14,
    fontWeight: '500',
  },
  commissionExample: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 8,
    fontStyle: 'italic',
  },
  billingTypeContainer: {
    marginTop: 4,
  },
  billingTypeValue: {
    fontSize: 14,
    color: COLORS.textMuted,
  },
  billingTypeNote: {
    fontSize: 12,
    color: '#f97316',
    marginTop: 8,
  },
  billingTypeBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginBottom: 8,
  },
  billingTypeBadgeText: {
    fontSize: 14,
    fontWeight: '600',
  },
  billingTypeDescription: {
    fontSize: 13,
    color: COLORS.textMuted,
  },
  sectionDivider: {
    marginTop: 20,
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  sectionDividerText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  settingsCardAction: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  settingsCardActionIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#f5f3ff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  settingsCardActionEmoji: {
    fontSize: 20,
  },
  settingsCardActionContent: {
    flex: 1,
  },
  settingsCardActionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 2,
  },
  settingsCardActionSubtitle: {
    fontSize: 13,
    color: COLORS.textMuted,
  },
  settingsCardActionArrow: {
    fontSize: 24,
    color: COLORS.textMuted,
    fontWeight: '300',
  },
  spcpInfoCard: {
    backgroundColor: '#eff6ff',
    borderRadius: 12,
    padding: 16,
    marginVertical: 12,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  spcpInfoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e40af',
    marginBottom: 4,
  },
  spcpInfoText: {
    fontSize: 13,
    color: '#2563eb',
    lineHeight: 20,
  },
  departmentsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  departmentBadge: {
    backgroundColor: '#eff6ff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  departmentText: {
    color: COLORS.primary,
    fontWeight: '500',
    fontSize: 13,
  },
  activityBadge: {
    backgroundColor: '#f0fdf4',
  },
  noDepartments: {
    fontSize: 14,
    color: COLORS.textMuted,
    fontStyle: 'italic',
  },
  logoutButton: {
    backgroundColor: '#fee2e2',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 20,
  },
  logoutButtonText: {
    color: '#dc2626',
    fontWeight: '600',
    fontSize: 16,
  },
  // Bottom Navigation
  bottomNav: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    backgroundColor: COLORS.card,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingVertical: 8,
    paddingBottom: 24,
  },
  bottomNavItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
  },
  bottomNavIconContainer: {
    position: 'relative',
  },
  bottomNavIcon: {
    fontSize: 24,
    opacity: 0.5,
  },
  activeNavIcon: {
    opacity: 1,
  },
  bottomNavText: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 4,
  },
  activeNavText: {
    color: '#2563eb',
    fontWeight: '600',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -10,
    backgroundColor: '#2563eb',
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 40,
    maxHeight: '80%',
  },
  modalHeader: {
    alignItems: 'center',
    padding: 24,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  modalAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  modalAvatarText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 28,
  },
  modalName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  modalEmail: {
    fontSize: 14,
    color: COLORS.textMuted,
    marginTop: 4,
  },
  modalCloseButton: {
    position: 'absolute',
    top: 20,
    right: 20,
    padding: 8,
  },
  modalCloseText: {
    fontSize: 24,
    color: COLORS.textMuted,
  },
  modalBody: {
    padding: 24,
  },
  modalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  modalLabel: {
    fontSize: 15,
    color: COLORS.textMuted,
  },
  modalValue: {
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.text,
  },
  modalStatusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  modalStatusText: {
    fontSize: 13,
    fontWeight: '600',
  },
  editCommissionButton: {
    backgroundColor: '#eff6ff',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  editCommissionText: {
    color: COLORS.primary,
    fontWeight: '500',
    fontSize: 14,
  },
  commissionEdit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  commissionInput: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    width: 60,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
  },
  commissionPercent: {
    fontSize: 16,
    color: COLORS.textMuted,
  },
  commissionSave: {
    backgroundColor: COLORS.success,
    padding: 8,
    borderRadius: 6,
  },
  commissionSaveText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  commissionCancel: {
    backgroundColor: '#fee2e2',
    padding: 8,
    borderRadius: 6,
  },
  commissionCancelText: {
    color: COLORS.danger,
    fontWeight: 'bold',
  },
  specialtiesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    flex: 1,
    justifyContent: 'flex-end',
  },
  specialtyBadge: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  specialtyText: {
    fontSize: 12,
    color: COLORS.text,
  },
  // Commission modal
  commissionModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  commissionModalContent: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 24,
    width: '80%',
    maxWidth: 320,
  },
  commissionModalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 20,
  },
  commissionModalInput: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  commissionModalTextInput: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    width: 80,
    textAlign: 'center',
    fontSize: 24,
    fontWeight: 'bold',
  },
  commissionModalPercent: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.textMuted,
    marginLeft: 8,
  },
  commissionModalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  commissionModalCancel: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  commissionModalCancelText: {
    color: COLORS.text,
    fontWeight: '600',
  },
  commissionModalSave: {
    flex: 1,
    backgroundColor: COLORS.primary,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  commissionModalSaveText: {
    color: '#fff',
    fontWeight: '600',
  },
  // Styles pour les interventions en cours du TL
  activeInterventionCard: {
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary,
    marginBottom: 12,
  },
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
    marginTop: 12,
    backgroundColor: COLORS.primary,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  continueButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  // Styles pour le récapitulatif des versements
  paymentSummaryCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  paymentSummaryHeader: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingBottom: 12,
    marginBottom: 12,
  },
  paymentSummaryTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  paymentSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  paymentLabel: {
    fontSize: 14,
    color: COLORS.textMuted,
  },
  paymentValue: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  paymentSummaryTotal: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    marginTop: 8,
    paddingTop: 12,
  },
  paymentTotalLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  paymentTotalValue: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  technicianPaymentsCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  technicianPaymentsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textMuted,
    marginBottom: 16,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  technicianPaymentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  technicianPaymentInfo: {
    flex: 1,
  },
  technicianPaymentName: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
  },
  technicianPaymentDetails: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  technicianPaymentAmount: {
    alignItems: 'flex-end',
  },
  technicianPaymentValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#f59e0b',
  },
  technicianPaymentStatus: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  // Styles pour les modales des cartes de stats
  tapHint: {
    fontSize: 9,
    color: 'rgba(0,0,0,0.3)',
    marginTop: 6,
    fontStyle: 'italic',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  modalClose: {
    fontSize: 24,
    color: COLORS.textMuted,
    padding: 4,
  },
  modalEmptyText: {
    textAlign: 'center',
    color: COLORS.textMuted,
    fontSize: 14,
    paddingVertical: 40,
  },
  modalListItem: {
    backgroundColor: COLORS.card,
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  modalItemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  modalBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeGreen: {
    backgroundColor: '#dcfce7',
  },
  badgeGray: {
    backgroundColor: '#f3f4f6',
  },
  modalBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
  },
  modalItemSubtitle: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginBottom: 4,
  },
  modalItemStats: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 8,
  },
  modalItemStat: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  modalItemAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.success,
    marginTop: 8,
  },
  modalSummary: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  modalSummaryItem: {
    alignItems: 'center',
  },
  modalSummaryNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  modalSummaryLabel: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 4,
  },
  // Revenue modal styles
  revenueCard: {
    backgroundColor: '#fef3c7',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 20,
  },
  revenueBigNumber: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#d97706',
  },
  revenueSubtitle: {
    fontSize: 14,
    color: '#92400e',
    marginTop: 4,
  },
  revenueBreakdown: {
    marginTop: 8,
  },
  revenueBreakdownTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textMuted,
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  revenueItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  revenueItemRef: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  revenueItemType: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  revenueItemAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#059669',
  },
  // Profit modal styles
  profitCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  profitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  profitLabel: {
    fontSize: 14,
    color: COLORS.textMuted,
  },
  profitLabelBold: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  profitValue: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  profitValueBold: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  profitGreen: {
    color: '#059669',
  },
  profitOrange: {
    color: '#f59e0b',
  },
  profitDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 8,
  },
  profitSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textMuted,
    marginBottom: 12,
    marginTop: 8,
    textTransform: 'uppercase',
  },
  techProfitItem: {
    backgroundColor: COLORS.card,
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  techProfitHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  techProfitName: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
  },
  techProfitCommission: {
    fontSize: 14,
    color: COLORS.primary,
    fontWeight: '600',
  },
  techProfitDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  techProfitText: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  techProfitToPay: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#f59e0b',
  },
});
