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
  hasTeamLeader?: boolean; // True si invité par un TL
  sectorsPreConfigured?: boolean; // True si les secteurs sont déjà configurés par le TL
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
  const [searchDepartment, setSearchDepartment] = useState('');

  // Informations pré-configurées par l'admin (lecture seule)
  const [profileInfo, setProfileInfo] = useState<ProfileInfo>({});
  
  // Nombre d'étapes dynamique selon le parcours
  // Si technicien invité par TL avec secteurs pré-configurés → 1 étape seulement
  const totalSteps = (user?.role === 'technician' && profileInfo.hasTeamLeader && profileInfo.sectorsPreConfigured) ? 1 : 2;

  useEffect(() => {
    checkProfile();
  }, [user]);

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
          
          // Vérifier si les secteurs sont pré-configurés par le TL
          const hasSectors = data.technician.selectedDepartments && 
                            Array.isArray(data.technician.selectedDepartments) && 
                            data.technician.selectedDepartments.length > 0;
          
          if (hasSectors) {
            setSelectedDepartments(data.technician.selectedDepartments);
          }
          
          // Vérifier si le technicien a été invité par un TL
          const hasTeamLeader = !!(data.technician.teamLeaderId || data.technician.teamLeaderName);
          
          // Informations configurées par l'admin/team leader
          setProfileInfo({
            billingType: data.technician.billingType,
            commissionPercentage: data.technician.commissionPercentage,
            teamLeaderName: data.technician.teamLeaderName,
            hasTeamLeader: hasTeamLeader,
            sectorsPreConfigured: hasTeamLeader && hasSectors, // Secteurs déjà choisis par le TL
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
          const teamLeader = data.data || data;

          const isComplete = teamLeader.selectedDepartments?.length > 0;
          if (isComplete) {
            onComplete();
            return;
          }

          setName(teamLeader.name || user.name || '');
          setPhone(teamLeader.phone || '');
          if (teamLeader.selectedDepartments) {
            setSelectedDepartments(teamLeader.selectedDepartments);
          }
          // Informations configurées par l'admin
          setProfileInfo({
            billingType: teamLeader.billingType,
            commissionPercentage: teamLeader.commissionFromAdmin,
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

  const filteredDepartments = FRENCH_DEPARTMENTS.filter(
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
      // Si on est à l'étape 1 et qu'il n'y a qu'une seule étape (secteurs pré-configurés), soumettre directement
      if (step === 1 && totalSteps === 1) {
        handleSubmit();
      } else if (step < totalSteps) {
        setStep(step + 1);
      } else {
        handleSubmit();
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

      // Seulement les données que l'utilisateur peut modifier
      const profileData: Record<string, any> = {
        name,
        phone,
      };
      
      // N'inclure les secteurs que si NON pré-configurés par le TL
      // (évite d'écraser les choix du TL)
      if (!profileInfo.sectorsPreConfigured) {
        profileData.selectedDepartments = selectedDepartments;
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
                
                {/* Afficher les secteurs pré-configurés par le TL */}
                {profileInfo.sectorsPreConfigured && selectedDepartments.length > 0 && (
                  <View style={[styles.configuredItem, { flexDirection: 'column', alignItems: 'flex-start' }]}>
                    <Text style={styles.configuredLabel}>Secteurs d'intervention :</Text>
                    <View style={styles.preConfiguredSectors}>
                      {selectedDepartments.map((code) => {
                        const dept = FRENCH_DEPARTMENTS.find(d => d.code === code);
                        return (
                          <View key={code} style={styles.preConfiguredSectorTag}>
                            <Text style={styles.preConfiguredSectorText}>
                              📍 {code} - {dept?.name || code}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                )}
              </View>
            )}
          </View>
        )}

        {/* Step 2: Départements - Seulement si NON pré-configurés par le TL */}
        {step === 2 && !profileInfo.sectorsPreConfigured && (
          <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>📍 Secteurs d'intervention</Text>
            <Text style={styles.stepDescription}>
              Sélectionnez les départements où vous intervenez
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
