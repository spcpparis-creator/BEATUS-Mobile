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
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import { COLORS, API_BASE_URL } from '../config/api';
import * as SecureStore from 'expo-secure-store';

// Liste des départements français
const FRENCH_DEPARTMENTS = [
  { code: '01', name: 'Ain' }, { code: '02', name: 'Aisne' }, { code: '03', name: 'Allier' },
  { code: '04', name: 'Alpes-de-Haute-Provence' }, { code: '05', name: 'Hautes-Alpes' },
  { code: '06', name: 'Alpes-Maritimes' }, { code: '07', name: 'Ardèche' }, { code: '08', name: 'Ardennes' },
  { code: '09', name: 'Ariège' }, { code: '10', name: 'Aube' }, { code: '11', name: 'Aude' },
  { code: '12', name: 'Aveyron' }, { code: '13', name: 'Bouches-du-Rhône' }, { code: '14', name: 'Calvados' },
  { code: '15', name: 'Cantal' }, { code: '16', name: 'Charente' }, { code: '17', name: 'Charente-Maritime' },
  { code: '18', name: 'Cher' }, { code: '19', name: 'Corrèze' }, { code: '21', name: 'Côte-d\'Or' },
  { code: '22', name: 'Côtes-d\'Armor' }, { code: '23', name: 'Creuse' }, { code: '24', name: 'Dordogne' },
  { code: '25', name: 'Doubs' }, { code: '26', name: 'Drôme' }, { code: '27', name: 'Eure' },
  { code: '28', name: 'Eure-et-Loir' }, { code: '29', name: 'Finistère' }, { code: '2A', name: 'Corse-du-Sud' },
  { code: '2B', name: 'Haute-Corse' }, { code: '30', name: 'Gard' }, { code: '31', name: 'Haute-Garonne' },
  { code: '32', name: 'Gers' }, { code: '33', name: 'Gironde' }, { code: '34', name: 'Hérault' },
  { code: '35', name: 'Ille-et-Vilaine' }, { code: '36', name: 'Indre' }, { code: '37', name: 'Indre-et-Loire' },
  { code: '38', name: 'Isère' }, { code: '39', name: 'Jura' }, { code: '40', name: 'Landes' },
  { code: '41', name: 'Loir-et-Cher' }, { code: '42', name: 'Loire' }, { code: '43', name: 'Haute-Loire' },
  { code: '44', name: 'Loire-Atlantique' }, { code: '45', name: 'Loiret' }, { code: '46', name: 'Lot' },
  { code: '47', name: 'Lot-et-Garonne' }, { code: '48', name: 'Lozère' }, { code: '49', name: 'Maine-et-Loire' },
  { code: '50', name: 'Manche' }, { code: '51', name: 'Marne' }, { code: '52', name: 'Haute-Marne' },
  { code: '53', name: 'Mayenne' }, { code: '54', name: 'Meurthe-et-Moselle' }, { code: '55', name: 'Meuse' },
  { code: '56', name: 'Morbihan' }, { code: '57', name: 'Moselle' }, { code: '58', name: 'Nièvre' },
  { code: '59', name: 'Nord' }, { code: '60', name: 'Oise' }, { code: '61', name: 'Orne' },
  { code: '62', name: 'Pas-de-Calais' }, { code: '63', name: 'Puy-de-Dôme' },
  { code: '64', name: 'Pyrénées-Atlantiques' }, { code: '65', name: 'Hautes-Pyrénées' },
  { code: '66', name: 'Pyrénées-Orientales' }, { code: '67', name: 'Bas-Rhin' }, { code: '68', name: 'Haut-Rhin' },
  { code: '69', name: 'Rhône' }, { code: '70', name: 'Haute-Saône' }, { code: '71', name: 'Saône-et-Loire' },
  { code: '72', name: 'Sarthe' }, { code: '73', name: 'Savoie' }, { code: '74', name: 'Haute-Savoie' },
  { code: '75', name: 'Paris' }, { code: '76', name: 'Seine-Maritime' }, { code: '77', name: 'Seine-et-Marne' },
  { code: '78', name: 'Yvelines' }, { code: '79', name: 'Deux-Sèvres' }, { code: '80', name: 'Somme' },
  { code: '81', name: 'Tarn' }, { code: '82', name: 'Tarn-et-Garonne' }, { code: '83', name: 'Var' },
  { code: '84', name: 'Vaucluse' }, { code: '85', name: 'Vendée' }, { code: '86', name: 'Vienne' },
  { code: '87', name: 'Haute-Vienne' }, { code: '88', name: 'Vosges' }, { code: '89', name: 'Yonne' },
  { code: '90', name: 'Territoire de Belfort' }, { code: '91', name: 'Essonne' },
  { code: '92', name: 'Hauts-de-Seine' }, { code: '93', name: 'Seine-Saint-Denis' },
  { code: '94', name: 'Val-de-Marne' }, { code: '95', name: 'Val-d\'Oise' },
];

interface Props {
  navigation: any;
  onComplete: () => void;
}

interface ProfileInfo {
  billingType?: 'spcp' | 'self';
  commissionPercentage?: number;
  teamLeaderName?: string;
  adminName?: string;
  hasTeamLeader?: boolean;
  availableSectors?: string[]; // Secteurs proposés par l'admin (codes départements)
  availableActivityIds?: string[]; // Activités proposées par l'admin
}

export default function ProfileCompletionScreen({ navigation, onComplete }: Props) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [checkingProfile, setCheckingProfile] = useState(true);
  const [step, setStep] = useState(1); // 1: Infos, 2: Secteurs (si applicable)

  // Form data - Seulement ce que l'utilisateur peut modifier
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([]);
  const [selectedActivityIds, setSelectedActivityIds] = useState<string[]>([]);
  const [activities, setActivities] = useState<Array<{ id: string; name: string }>>([]);
  const [searchDepartment, setSearchDepartment] = useState('');

  // Informations pré-configurées par l'admin (lecture seule)
  const [profileInfo, setProfileInfo] = useState<ProfileInfo>({});
  
  // Nombre d'étapes dynamique selon le parcours
  // Si technicien invité par TL avec secteurs pré-configurés → 1 étape seulement
  const hasSectorsStep = (profileInfo.availableSectors?.length ?? 0) > 0;
  const hasActivitiesStep = (profileInfo.availableActivityIds?.length ?? 0) > 0;
  const totalSteps = 1 + (hasSectorsStep ? 1 : 0) + (hasActivitiesStep ? 1 : 0);

  useEffect(() => {
    checkProfile();
  }, [user]);

  useEffect(() => {
    if ((profileInfo.availableActivityIds?.length ?? 0) > 0 && activities.length === 0) {
      api.getActivities().then((acts: any) => {
        const list = Array.isArray(acts) ? acts : (acts?.activities || acts || []);
        const allowed = new Set(profileInfo.availableActivityIds || []);
        setActivities(list.filter((a: { id: string }) => allowed.has(a.id)));
      }).catch(() => {});
    }
  }, [profileInfo.availableActivityIds]);

  const checkProfile = async () => {
    if (!user) return;

    try {
      const token = await SecureStore.getItemAsync('authToken');

      if (user.role === 'technician') {
        const response = await fetch(`${API_BASE_URL}/technicians/check-profile`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        const data = await response.json();

        if (data.complete) {
          onComplete();
          return;
        }

        if (data.technician) {
          setName(data.technician.name || user.name || '');
          setPhone(data.technician.phone || '');
          setSelectedDepartments(data.technician.selectedDepartments || data.technician.selected_departments || []);
          setSelectedActivityIds(data.technician.activityIds || data.technician.activity_ids || []);
          setProfileInfo({
            billingType: data.technician.billingType,
            commissionPercentage: data.technician.commissionPercentage,
            teamLeaderName: data.technician.teamLeaderName,
            hasTeamLeader: !!(data.technician.teamLeaderId || data.technician.teamLeaderName),
            availableSectors: data.availableSectors || [],
            availableActivityIds: data.availableActivityIds || [],
          });
        } else {
          setName(user.name || '');
        }
      } else if (user.role === 'team_leader') {
        const response = await fetch(`${API_BASE_URL}/team-leaders/me`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });

        if (response.ok) {
          const data = await response.json();
          const tl = data.data || data;
          const depts = tl.selectedDepartments ?? tl.selected_departments ?? [];
          const tlName = tl.name ?? tl.user?.name ?? user.name ?? '';
          const tlPhone = tl.phone ?? tl.user?.phone ?? '';
          const tlEmail = tl.email ?? tl.user?.email ?? user.email ?? '';

          const isComplete = !!(tlPhone?.trim() && (tlEmail?.trim() || tlName?.trim()));
          if (isComplete) {
            onComplete();
            return;
          }

          setName(tlName || user.name || '');
          setPhone(tlPhone || '');
          if (depts?.length) setSelectedDepartments(depts);
          const acts = tl.activityIds ?? tl.activity_ids ?? [];
          if (acts?.length) setSelectedActivityIds(acts);
          setProfileInfo({
            billingType: tl.billingType ?? tl.billing_type,
            commissionPercentage: tl.commissionFromAdmin ?? tl.commission_from_admin,
            availableSectors: tl.availableSectors ?? tl.available_sectors ?? depts ?? [],
            availableActivityIds: tl.availableActivityIds ?? tl.available_activity_ids ?? acts ?? [],
          });
        } else {
          setName(user.name || '');
        }
      }
    } catch (error) {
      console.error('Erreur vérification profil:', error);
      setName(user?.name || '');
    } finally {
      setCheckingProfile(false);
    }
  };

  const toggleDepartment = (code: string) => {
    setSelectedDepartments(prev =>
      prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
    );
  };

  const toggleActivity = (id: string) => {
    setSelectedActivityIds(prev =>
      prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]
    );
  };

  const availableDepartments = (profileInfo.availableSectors?.length ?? 0) > 0
    ? FRENCH_DEPARTMENTS.filter(d => profileInfo.availableSectors!.includes(d.code))
    : FRENCH_DEPARTMENTS;
  const filteredDepartments = availableDepartments.filter(
    d => d.code.includes(searchDepartment) || d.name.toLowerCase().includes(searchDepartment.toLowerCase())
  );

  const validateStep = () => {
    switch (step) {
      case 1:
        if (!name.trim()) {
          Alert.alert('Erreur', 'Veuillez entrer votre nom');
          return false;
        }
        if (!phone.trim()) {
          Alert.alert('Erreur', 'Veuillez entrer votre téléphone');
          return false;
        }
        return true;
      case 2:
        // Si les secteurs sont pré-configurés par le TL, pas besoin de validation
        if (profileInfo.sectorsPreConfigured) {
          return true;
        }
        if (selectedDepartments.length === 0) {
          Alert.alert('Erreur', 'Veuillez sélectionner au moins un département');
          return false;
        }
        return true;
      default:
        return true;
    }
  };

  const nextStep = () => {
    if (validateStep()) {
      if (step >= totalSteps) {
        handleSubmit();
      } else {
        setStep(step + 1);
      }
    }
  };

  const prevStep = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const token = await SecureStore.getItemAsync('authToken');

      // Données à envoyer : name, email, phone → enregistrés définitivement en DB
      // Pour TL : inclure selectedDepartments et activityIds (définis par l'admin lors de l'invitation)
      const profileData: Record<string, any> = {
        name,
        phone,
        ...(user?.email ? { email: user.email } : {}),
      };
      
      if (user?.role === 'team_leader') {
        // Toujours envoyer secteurs et activités du TL (configurés par l'admin) pour les persister
        if (selectedDepartments.length > 0) profileData.selectedDepartments = selectedDepartments;
        if (selectedActivityIds.length > 0) profileData.activityIds = selectedActivityIds;
      } else if (user?.role === 'technician') {
        if (hasSectorsStep) profileData.selectedDepartments = selectedDepartments;
        if (hasActivitiesStep) profileData.activityIds = selectedActivityIds;
      }

      let endpoint = '';

      if (user?.role === 'technician') {
        endpoint = `${API_BASE_URL}/technicians/profile`;
      } else if (user?.role === 'team_leader') {
        endpoint = `${API_BASE_URL}/team-leaders/me`;
      }

      console.log('Envoi du profil:', { endpoint, profileData });

      const response = await fetch(endpoint, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(profileData),
      });

      const responseData = await response.json();
      console.log('Réponse:', responseData);

      if (!response.ok) {
        throw new Error(responseData.error || 'Erreur lors de la mise à jour');
      }

      Alert.alert('Succès', 'Profil complété avec succès !', [
        { text: 'Continuer', onPress: onComplete },
      ]);
    } catch (error: any) {
      console.error('Erreur handleSubmit:', error);
      Alert.alert('Erreur', error.message || 'Impossible de mettre à jour le profil');
    } finally {
      setLoading(false);
    }
  };

  if (checkingProfile) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Vérification du profil...</Text>
      </View>
    );
  }

  const roleLabel = user?.role === 'team_leader' ? 'Chef d\'équipe' : 'Technicien';

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Compléter mon profil</Text>
        <Text style={styles.headerSubtitle}>{roleLabel}</Text>
        <View style={styles.progressContainer}>
          {Array.from({ length: totalSteps }, (_, i) => i + 1).map((s) => (
            <View
              key={s}
              style={[
                styles.progressDot,
                s === step && styles.progressDotActive,
                s < step && styles.progressDotCompleted,
              ]}
            />
          ))}
        </View>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Step 1: Informations personnelles */}
        {step === 1 && (
          <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>👤 Informations personnelles</Text>
            <Text style={styles.stepDescription}>
              Ces informations seront visibles par vos clients et votre équipe
            </Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Nom complet *</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Jean Dupont"
                autoCapitalize="words"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Email</Text>
              <TextInput
                style={[styles.input, styles.inputDisabled]}
                value={user?.email || ''}
                editable={false}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Téléphone *</Text>
              <TextInput
                style={styles.input}
                value={phone}
                onChangeText={setPhone}
                placeholder="06 12 34 56 78"
                keyboardType="phone-pad"
              />
            </View>

            {/* Afficher les paramètres configurés par l'admin (lecture seule) */}
            {(profileInfo.billingType || profileInfo.commissionPercentage) && (
              <View style={styles.configuredByAdmin}>
                <Text style={styles.configuredTitle}>⚙️ Paramètres configurés par votre administrateur</Text>
                
                {profileInfo.billingType && (
                  <View style={styles.configuredItem}>
                    <Text style={styles.configuredLabel}>Facturation :</Text>
                    <Text style={styles.configuredValue}>
                      {profileInfo.billingType === 'spcp' ? 'SPCP facture' : 'Auto-facturation'}
                    </Text>
                  </View>
                )}
                
                {profileInfo.commissionPercentage && (
                  <View style={styles.configuredItem}>
                    <Text style={styles.configuredLabel}>Commission :</Text>
                    <Text style={styles.configuredValue}>{profileInfo.commissionPercentage}%</Text>
                  </View>
                )}

                {profileInfo.teamLeaderName && (
                  <View style={styles.configuredItem}>
                    <Text style={styles.configuredLabel}>Chef d'équipe :</Text>
                    <Text style={styles.configuredValue}>{profileInfo.teamLeaderName}</Text>
                  </View>
                )}
                
              </View>
            )}
          </View>
        )}

        {/* Step 2: Secteurs (définis par l'admin) */}
        {step === 2 && hasSectorsStep && (
          <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>📍 Secteurs d'intervention</Text>
            <Text style={styles.stepDescription}>
              Sélectionnez les secteurs définis par votre administrateur
            </Text>

            <View style={styles.inputGroup}>
              <TextInput
                style={styles.searchInput}
                value={searchDepartment}
                onChangeText={setSearchDepartment}
                placeholder="🔍 Rechercher un département..."
              />
            </View>

            {selectedDepartments.length > 0 && (
              <View style={styles.selectedTags}>
                {selectedDepartments.map((code) => {
                  const dept = FRENCH_DEPARTMENTS.find(d => d.code === code);
                  return (
                    <TouchableOpacity
                      key={code}
                      style={styles.selectedTag}
                      onPress={() => toggleDepartment(code)}
                    >
                      <Text style={styles.selectedTagText}>
                        {code} - {dept?.name} ✕
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            <View style={styles.departmentsList}>
              {filteredDepartments.slice(0, 20).map((dept) => (
                <TouchableOpacity
                  key={dept.code}
                  style={[
                    styles.departmentItem,
                    selectedDepartments.includes(dept.code) && styles.departmentItemSelected,
                  ]}
                  onPress={() => toggleDepartment(dept.code)}
                >
                  <Text
                    style={[
                      styles.departmentText,
                      selectedDepartments.includes(dept.code) && styles.departmentTextSelected,
                    ]}
                  >
                    {dept.code} - {dept.name}
                  </Text>
                  {selectedDepartments.includes(dept.code) && (
                    <Text style={styles.departmentCheck}>✓</Text>
                  )}
                </TouchableOpacity>
              ))}
              {filteredDepartments.length > 20 && (
                <Text style={styles.moreText}>
                  ... et {filteredDepartments.length - 20} autres. Utilisez la recherche.
                </Text>
              )}
            </View>
          </View>
        )}

        {/* Step 3: Activités (définies par l'admin) */}
        {step === 3 && hasActivitiesStep && (
          <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>🔧 Activités</Text>
            <Text style={styles.stepDescription}>
              Sélectionnez les activités définies par votre administrateur
            </Text>
            <View style={styles.departmentsList}>
              {activities.map((act) => (
                <TouchableOpacity
                  key={act.id}
                  style={[
                    styles.departmentItem,
                    selectedActivityIds.includes(act.id) && styles.departmentItemSelected,
                  ]}
                  onPress={() => toggleActivity(act.id)}
                >
                  <Text
                    style={[
                      styles.departmentText,
                      selectedActivityIds.includes(act.id) && styles.departmentTextSelected,
                    ]}
                  >
                    {act.name}
                  </Text>
                  {selectedActivityIds.includes(act.id) && (
                    <Text style={styles.departmentCheck}>✓</Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>
            {activities.length === 0 && (
              <Text style={styles.moreText}>Chargement des activités...</Text>
            )}
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Navigation buttons */}
      <View style={styles.navigation}>
        {step > 1 && (
          <TouchableOpacity style={styles.backButton} onPress={prevStep}>
            <Text style={styles.backButtonText}>← Retour</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.nextButton, loading && styles.buttonDisabled]}
          onPress={nextStep}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.nextButtonText}>
              {step === totalSteps ? 'Terminer' : 'Continuer →'}
            </Text>
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
    backgroundColor: COLORS.background,
  },
  loadingText: {
    marginTop: 16,
    color: COLORS.textMuted,
    fontSize: 16,
  },
  header: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 20,
    paddingVertical: 24,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#bfdbfe',
    marginTop: 4,
  },
  progressContainer: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 20,
  },
  progressDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  progressDotActive: {
    backgroundColor: '#fff',
    width: 24,
  },
  progressDotCompleted: {
    backgroundColor: '#4ade80',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  stepContainer: {
    marginBottom: 20,
  },
  stepTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 8,
  },
  stepDescription: {
    fontSize: 14,
    color: COLORS.textMuted,
    marginBottom: 24,
    lineHeight: 20,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8,
  },
  input: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: COLORS.text,
  },
  inputDisabled: {
    backgroundColor: '#f1f5f9',
    color: COLORS.textMuted,
  },
  searchInput: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: COLORS.text,
  },
  configuredByAdmin: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 12,
    padding: 16,
    marginTop: 20,
  },
  configuredTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#166534',
    marginBottom: 12,
  },
  configuredItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#dcfce7',
  },
  configuredLabel: {
    fontSize: 14,
    color: '#166534',
  },
  configuredValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#166534',
  },
  preConfiguredSectors: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  preConfiguredSectorTag: {
    backgroundColor: '#dcfce7',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  preConfiguredSectorText: {
    fontSize: 12,
    color: '#166534',
    fontWeight: '500',
  },
  selectedTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  selectedTag: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  selectedTagText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
  },
  departmentsList: {
    gap: 8,
  },
  departmentItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  departmentItemSelected: {
    borderColor: COLORS.primary,
    backgroundColor: '#eff6ff',
  },
  departmentText: {
    fontSize: 15,
    color: COLORS.text,
  },
  departmentTextSelected: {
    color: COLORS.primary,
    fontWeight: '600',
  },
  departmentCheck: {
    color: COLORS.primary,
    fontWeight: 'bold',
    fontSize: 16,
  },
  moreText: {
    textAlign: 'center',
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: 12,
  },
  navigation: {
    flexDirection: 'row',
    padding: 20,
    paddingBottom: 32,
    gap: 12,
    backgroundColor: COLORS.card,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  backButton: {
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  backButtonText: {
    color: COLORS.textMuted,
    fontSize: 16,
    fontWeight: '500',
  },
  nextButton: {
    flex: 1,
    backgroundColor: COLORS.primary,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  nextButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
