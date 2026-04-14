import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../services/api';
import { COLORS } from '../../config/api';

const FRENCH_DEPARTMENTS: Record<string, string> = {
  '01': 'Ain', '02': 'Aisne', '03': 'Allier', '04': 'Alpes-de-Haute-Provence', '05': 'Hautes-Alpes',
  '06': 'Alpes-Maritimes', '07': 'Ardèche', '08': 'Ardennes', '09': 'Ariège', '10': 'Aube',
  '11': 'Aude', '12': 'Aveyron', '13': 'Bouches-du-Rhône', '14': 'Calvados', '15': 'Cantal',
  '16': 'Charente', '17': 'Charente-Maritime', '18': 'Cher', '19': 'Corrèze', '2A': 'Corse-du-Sud',
  '2B': 'Haute-Corse', '21': "Côte-d'Or", '22': "Côtes-d'Armor", '23': 'Creuse', '24': 'Dordogne',
  '25': 'Doubs', '26': 'Drôme', '27': 'Eure', '28': 'Eure-et-Loir', '29': 'Finistère',
  '30': 'Gard', '31': 'Haute-Garonne', '32': 'Gers', '33': 'Gironde', '34': 'Hérault',
  '35': 'Ille-et-Vilaine', '36': 'Indre', '37': 'Indre-et-Loire', '38': 'Isère', '39': 'Jura',
  '40': 'Landes', '41': 'Loir-et-Cher', '42': 'Loire', '43': 'Haute-Loire', '44': 'Loire-Atlantique',
  '45': 'Loiret', '46': 'Lot', '47': 'Lot-et-Garonne', '48': 'Lozère', '49': 'Maine-et-Loire',
  '50': 'Manche', '51': 'Marne', '52': 'Haute-Marne', '53': 'Mayenne', '54': 'Meurthe-et-Moselle',
  '55': 'Meuse', '56': 'Morbihan', '57': 'Moselle', '58': 'Nièvre', '59': 'Nord',
  '60': 'Oise', '61': 'Orne', '62': 'Pas-de-Calais', '63': 'Puy-de-Dôme', '64': 'Pyrénées-Atlantiques',
  '65': 'Hautes-Pyrénées', '66': 'Pyrénées-Orientales', '67': 'Bas-Rhin', '68': 'Haut-Rhin', '69': 'Rhône',
  '70': 'Haute-Saône', '71': 'Saône-et-Loire', '72': 'Sarthe', '73': 'Savoie', '74': 'Haute-Savoie',
  '75': 'Paris', '76': 'Seine-Maritime', '77': 'Seine-et-Marne', '78': 'Yvelines', '79': 'Deux-Sèvres',
  '80': 'Somme', '81': 'Tarn', '82': 'Tarn-et-Garonne', '83': 'Var', '84': 'Vaucluse',
  '85': 'Vendée', '86': 'Vienne', '87': 'Haute-Vienne', '88': 'Vosges', '89': 'Yonne',
  '90': 'Territoire de Belfort', '91': 'Essonne', '92': 'Hauts-de-Seine', '93': 'Seine-Saint-Denis',
  '94': 'Val-de-Marne', '95': "Val-d'Oise"
};

export default function TechnicianSettingsScreen({ navigation }: any) {
  const { user, logout } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [technicianProfile, setTechnicianProfile] = useState<any>(null);
  const [activityNames, setActivityNames] = useState<Record<string, string>>({});

  const loadData = async () => {
    try {
      const [profileData, activitiesData] = await Promise.all([
        api.getTechnicianProfile().catch(() => null),
        api.getActivities().catch(() => []),
      ]);
      setTechnicianProfile(profileData);

      const acts = Array.isArray(activitiesData) ? activitiesData : activitiesData?.data?.activities || activitiesData?.activities || [];
      const names: Record<string, string> = {};
      (acts as any[]).forEach((a: any) => {
        if (a?.id && a?.name) names[a.id] = a.name;
      });
      setActivityNames(names);
    } catch (error) {
      console.error('Erreur chargement paramètres:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState('');
  const [savingName, setSavingName] = useState(false);

  const currentName = technicianProfile?.name || user?.name || '';
  const commission = technicianProfile?.commissionPercentage ?? technicianProfile?.commission_percentage ?? 30;
  const sectors = technicianProfile?.selectedDepartments ?? technicianProfile?.selected_departments ?? [];
  const rawActivityIds = technicianProfile?.activityIds ?? technicianProfile?.activity_ids ?? [];
  const activityIds = (Array.isArray(rawActivityIds) && rawActivityIds.length > 0)
    ? rawActivityIds
    : (technicianProfile?.specialties ?? []);

  const handleSaveName = async () => {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === currentName) {
      setEditingName(false);
      return;
    }
    setSavingName(true);
    try {
      await api.updateMyProfile({ name: trimmed });
      setTechnicianProfile((prev: any) => prev ? { ...prev, name: trimmed } : prev);
      setEditingName(false);
      Alert.alert('Succès', 'Votre nom a été mis à jour.');
    } catch {
      Alert.alert('Erreur', 'Impossible de mettre à jour le nom.');
    } finally {
      setSavingName(false);
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
        <Text style={styles.headerTitle}>Paramètres</Text>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} />
        }
      >
        {/* Titre : Valeurs définies lors de l'invitation */}
        <View style={styles.invitationConfigHeader}>
          <Text style={styles.invitationConfigTitle}>📋 Ma configuration</Text>
          <Text style={styles.invitationConfigSubtitle}>
            Valeurs saisies lors de la génération du code d'invitation (par l'admin ou le chef d'équipe)
          </Text>
        </View>

        {/* Nom affiché */}
        <View style={styles.settingsCard}>
          <Text style={styles.settingsLabel}>👤 Nom affiché</Text>
          {editingName ? (
            <View>
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
              onPress={() => { setNewName(currentName); setEditingName(true); }}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#f9fafb', padding: 14, borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb' }}
            >
              <Text style={{ fontSize: 16, color: '#111827', fontWeight: '500' }}>{currentName || 'Non défini'}</Text>
              <Text style={{ fontSize: 13, color: COLORS.primary, fontWeight: '600' }}>Modifier ✏️</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Commission */}
        <View style={styles.settingsCard}>
          <Text style={styles.settingsLabel}>💰 Commission</Text>
          <View style={styles.commissionValueCard}>
            <Text style={styles.commissionValue}>{commission}%</Text>
            <Text style={styles.commissionHint}>sur chaque intervention terminée</Text>
          </View>
        </View>

        {/* Secteurs d'intervention */}
        <View style={styles.settingsCard}>
          <Text style={styles.settingsLabel}>📍 Secteurs d'intervention</Text>
          <View style={styles.badgesContainer}>
            {sectors.length > 0 ? (
              sectors.map((code: string) => (
                <View key={code} style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {code} - {FRENCH_DEPARTMENTS[code] || code}
                  </Text>
                </View>
              ))
            ) : (
              <Text style={styles.emptyText}>Aucun secteur défini</Text>
            )}
          </View>
        </View>

        {/* Activités / Spécialités */}
        <View style={styles.settingsCard}>
          <Text style={styles.settingsLabel}>🔧 Activités / Spécialités</Text>
          <View style={styles.badgesContainer}>
            {activityIds.length > 0 ? (
              activityIds.map((id: string) => (
                <View key={id} style={[styles.badge, styles.activityBadge]}>
                  <Text style={styles.activityBadgeText}>
                    {activityNames[id] || id}
                  </Text>
                </View>
              ))
            ) : (
              <Text style={styles.emptyText}>Aucune activité définie</Text>
            )}
          </View>
        </View>

        {/* Paiement SumUp */}
        <TouchableOpacity
          style={styles.settingsCard}
          onPress={() => navigation.navigate('SumUpSettings')}
          activeOpacity={0.7}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={{ fontSize: 20 }}>💳</Text>
              <View>
                <Text style={styles.settingsLabel}>Paiement SumUp</Text>
                <Text style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 2 }}>
                  Liens de paiement dans vos devis et factures
                </Text>
              </View>
            </View>
            <Text style={{ fontSize: 18, color: COLORS.textMuted }}>›</Text>
          </View>
        </TouchableOpacity>

        {/* Bouton déconnexion */}
        <TouchableOpacity style={styles.logoutButton} onPress={logout}>
          <Text style={styles.logoutText}>Se déconnecter</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
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
    backgroundColor: COLORS.primary,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  backButton: {
    marginBottom: 8,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  invitationConfigHeader: {
    marginBottom: 20,
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
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  settingsLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 12,
  },
  commissionValueCard: {
    backgroundColor: '#ecfdf5',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  commissionValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#059669',
  },
  commissionHint: {
    fontSize: 12,
    color: '#065f46',
    marginTop: 4,
  },
  badgesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  badge: {
    backgroundColor: '#ede9fe',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  badgeText: {
    color: '#7c3aed',
    fontSize: 13,
    fontWeight: '500',
  },
  activityBadge: {
    backgroundColor: '#dcfce7',
  },
  activityBadgeText: {
    color: '#16a34a',
    fontSize: 13,
    fontWeight: '500',
  },
  emptyText: {
    fontSize: 14,
    color: COLORS.textMuted,
  },
  logoutButton: {
    marginTop: 24,
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
});
