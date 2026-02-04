import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS } from '../../config/api';
import api from '../../services/api';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface Activity {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
}

interface Props {
  navigation: any;
  route: {
    params: {
      technician: any;
      teamLeader: any;
    };
  };
}

// Liste des départements français
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

// Les icônes par défaut pour les activités courantes
const ACTIVITY_ICONS: Record<string, string> = {
  'plomberie': '🔧',
  'électricité': '⚡',
  'electricite': '⚡',
  'chauffage': '🔥',
  'climatisation': '❄️',
  'serrurerie': '🔐',
  'vitrerie': '🪟',
  'menuiserie': '🪚',
  'peinture': '🎨',
  'dépannage': '🛠️',
  'installation': '📦',
  'maintenance': '🔩',
};

const getActivityIcon = (name: string): string => {
  const key = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return ACTIVITY_ICONS[key] || '🔧';
};

const COMMISSION_PRESETS = [10, 15, 20, 25, 30, 35, 40, 50];

export default function TechnicianEditScreen({ navigation, route }: Props) {
  const { technician, teamLeader } = route.params;
  
  const [saving, setSaving] = useState(false);
  const [loadingActivities, setLoadingActivities] = useState(true);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [commission, setCommission] = useState(Number(technician.commissionPercentage) || 30);
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>(
    technician.selectedDepartments || technician.selected_departments || []
  );
  const [selectedSpecialties, setSelectedSpecialties] = useState<string[]>(
    technician.specialties || []
  );

  // Charger les activités du tenant
  useEffect(() => {
    const loadActivities = async () => {
      try {
        const data = await api.getActivities();
        setActivities(data);
      } catch (error) {
        console.error('Erreur chargement activités:', error);
        // En cas d'erreur, ne pas bloquer l'utilisateur
      } finally {
        setLoadingActivities(false);
      }
    };
    loadActivities();
  }, []);

  // Secteurs disponibles = secteurs du team leader
  const availableDepartments = teamLeader?.selectedDepartments || teamLeader?.selected_departments || [];

  const getInitials = (name: string) => {
    if (!name) return '?';
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
  };

  const toggleDepartment = (code: string) => {
    setSelectedDepartments(prev =>
      prev.includes(code)
        ? prev.filter(d => d !== code)
        : [...prev, code]
    );
  };

  const toggleSpecialty = (specialty: string) => {
    setSelectedSpecialties(prev =>
      prev.includes(specialty)
        ? prev.filter(s => s !== specialty)
        : [...prev, specialty]
    );
  };

  const handleSave = async () => {
    if (selectedDepartments.length === 0) {
      Alert.alert('Attention', 'Sélectionnez au moins un secteur d\'intervention');
      return;
    }

    setSaving(true);
    try {
      await api.updateTechnicianByTeamLeader(teamLeader.id, technician.id, {
        commissionPercentage: commission,
        selectedDepartments,
        specialties: selectedSpecialties,
      });
      
      Alert.alert('✅ Succès', 'Les paramètres du technicien ont été mis à jour', [
        { text: 'OK', onPress: () => navigation.goBack() }
      ]);
    } catch (error: any) {
      console.error('Erreur mise à jour technicien:', error);
      Alert.alert('Erreur', error.message || 'Impossible de sauvegarder les modifications');
    } finally {
      setSaving(false);
    }
  };

  const billingTypeLabel = teamLeader?.billingType === 'self' ? 'Facturation autonome' : 'Facturation SPCP';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          onPress={() => navigation.goBack()} 
          style={styles.backButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.backIcon}>←</Text>
          <Text style={styles.backText}>Retour</Text>
        </TouchableOpacity>
        
        <View style={styles.technicianHeader}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{getInitials(technician.name)}</Text>
          </View>
          <View style={styles.technicianDetails}>
            <Text style={styles.technicianName}>{technician.name || 'Technicien'}</Text>
            <Text style={styles.technicianEmail}>{technician.email}</Text>
            {technician.phone && (
              <Text style={styles.technicianPhone}>📱 {technician.phone}</Text>
            )}
          </View>
        </View>
      </View>

      <ScrollView 
        style={styles.scrollView} 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Info facturation */}
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Type de facturation</Text>
            <View style={[
              styles.infoBadge,
              teamLeader?.billingType === 'self' ? styles.badgeSelf : styles.badgeSpcp
            ]}>
              <Text style={styles.infoBadgeText}>{billingTypeLabel}</Text>
            </View>
          </View>
          <Text style={styles.infoHint}>
            {teamLeader?.billingType === 'self' 
              ? 'Vous facturez directement vos clients'
              : 'SPCP facture pour vous'
            }
          </Text>
        </View>

        {/* Commission */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionIcon}>💰</Text>
            <View>
              <Text style={styles.sectionTitle}>Commission technicien</Text>
              <Text style={styles.sectionSubtitle}>Pourcentage sur chaque intervention</Text>
            </View>
          </View>
          
          <View style={styles.commissionDisplay}>
            <Text style={styles.commissionValue}>{commission}%</Text>
            <Text style={styles.commissionHint}>du montant HT - Matériel</Text>
          </View>
          
          <View style={styles.presetsGrid}>
            {COMMISSION_PRESETS.map(val => (
              <TouchableOpacity
                key={val}
                style={[
                  styles.presetButton,
                  commission === val && styles.presetButtonActive
                ]}
                onPress={() => setCommission(val)}
              >
                <Text style={[
                  styles.presetText,
                  commission === val && styles.presetTextActive
                ]}>
                  {val}%
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Secteurs */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionIcon}>📍</Text>
            <View>
              <Text style={styles.sectionTitle}>Secteurs d'intervention</Text>
              <Text style={styles.sectionSubtitle}>
                {selectedDepartments.length} sur {availableDepartments.length} disponible(s)
              </Text>
            </View>
          </View>
          
          {availableDepartments.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>🗺️</Text>
              <Text style={styles.emptyText}>
                Aucun secteur disponible.{'\n'}
                Configurez d'abord vos secteurs dans votre profil.
              </Text>
            </View>
          ) : (
            <View style={styles.departmentsList}>
              {availableDepartments.map((code: string) => {
                const isSelected = selectedDepartments.includes(code);
                return (
                  <TouchableOpacity
                    key={code}
                    style={[
                      styles.departmentItem,
                      isSelected && styles.departmentItemActive
                    ]}
                    onPress={() => toggleDepartment(code)}
                    activeOpacity={0.7}
                  >
                    <View style={[
                      styles.checkbox,
                      isSelected && styles.checkboxActive
                    ]}>
                      {isSelected && <Text style={styles.checkmark}>✓</Text>}
                    </View>
                    <Text style={[styles.departmentCode, isSelected && styles.departmentCodeActive]}>
                      {code}
                    </Text>
                    <Text style={[styles.departmentName, isSelected && styles.departmentNameActive]}>
                      {FRENCH_DEPARTMENTS[code] || code}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

        {/* Activités / Spécialités */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionIcon}>🔧</Text>
            <View>
              <Text style={styles.sectionTitle}>Activités</Text>
              <Text style={styles.sectionSubtitle}>
                {selectedSpecialties.length} sélectionnée(s)
              </Text>
            </View>
          </View>
          
          {loadingActivities ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color="#7c3aed" />
              <Text style={styles.loadingText}>Chargement des activités...</Text>
            </View>
          ) : activities.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>📋</Text>
              <Text style={styles.emptyText}>
                Aucune activité disponible.{'\n'}
                L'administrateur doit créer les activités depuis son dashboard.
              </Text>
            </View>
          ) : (
            <View style={styles.specialtiesGrid}>
              {activities.map(activity => {
                const isSelected = selectedSpecialties.includes(activity.id) || 
                                  selectedSpecialties.includes(activity.name);
                return (
                  <TouchableOpacity
                    key={activity.id}
                    style={[
                      styles.specialtyButton,
                      isSelected && styles.specialtyButtonActive
                    ]}
                    onPress={() => toggleSpecialty(activity.name)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.specialtyIcon}>{getActivityIcon(activity.name)}</Text>
                    <Text style={[
                      styles.specialtyText,
                      isSelected && styles.specialtyTextActive
                    ]}>
                      {activity.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

        {/* Espace pour les boutons */}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Boutons fixes en bas */}
      <View style={styles.bottomButtons}>
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={() => navigation.goBack()}
          disabled={saving}
        >
          <Text style={styles.cancelButtonText}>Annuler</Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.saveButtonText}>💾 Enregistrer</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    backgroundColor: '#7c3aed',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 20,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  backIcon: {
    color: '#fff',
    fontSize: 20,
    marginRight: 4,
  },
  backText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
  technicianHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  avatarText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 'bold',
  },
  technicianDetails: {
    flex: 1,
  },
  technicianName: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 'bold',
  },
  technicianEmail: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    marginTop: 2,
  },
  technicianPhone: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    marginTop: 4,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  infoCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoLabel: {
    fontSize: 14,
    color: '#64748b',
  },
  infoBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  badgeSpcp: {
    backgroundColor: '#dbeafe',
  },
  badgeSelf: {
    backgroundColor: '#dcfce7',
  },
  infoBadgeText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1e40af',
  },
  infoHint: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 8,
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  sectionIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1e293b',
  },
  sectionSubtitle: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 2,
  },
  commissionDisplay: {
    alignItems: 'center',
    paddingVertical: 16,
    marginBottom: 16,
    backgroundColor: '#f5f3ff',
    borderRadius: 12,
  },
  commissionValue: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#7c3aed',
  },
  commissionHint: {
    fontSize: 13,
    color: '#8b5cf6',
    marginTop: 4,
  },
  presetsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
  },
  presetButton: {
    width: (SCREEN_WIDTH - 32 - 32 - 24) / 4,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
  },
  presetButtonActive: {
    backgroundColor: '#7c3aed',
  },
  presetText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#64748b',
  },
  presetTextActive: {
    color: '#fff',
  },
  departmentsList: {
    gap: 8,
  },
  departmentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#f8fafc',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  departmentItemActive: {
    backgroundColor: '#f5f3ff',
    borderColor: '#7c3aed',
  },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#cbd5e1',
    marginRight: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxActive: {
    backgroundColor: '#7c3aed',
    borderColor: '#7c3aed',
  },
  checkmark: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  departmentCode: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#94a3b8',
    width: 36,
  },
  departmentCodeActive: {
    color: '#7c3aed',
  },
  departmentName: {
    flex: 1,
    fontSize: 15,
    color: '#475569',
  },
  departmentNameActive: {
    color: '#1e293b',
    fontWeight: '500',
  },
  emptyState: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 20,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    gap: 10,
  },
  loadingText: {
    fontSize: 14,
    color: '#64748b',
  },
  specialtiesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  specialtyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 24,
    backgroundColor: '#f1f5f9',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  specialtyButtonActive: {
    backgroundColor: '#f5f3ff',
    borderColor: '#7c3aed',
  },
  specialtyIcon: {
    fontSize: 16,
    marginRight: 6,
  },
  specialtyText: {
    fontSize: 14,
    color: '#64748b',
  },
  specialtyTextActive: {
    color: '#7c3aed',
    fontWeight: '600',
  },
  bottomButtons: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    padding: 16,
    paddingBottom: 32,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#475569',
    fontSize: 16,
    fontWeight: '600',
  },
  saveButton: {
    flex: 2,
    backgroundColor: '#7c3aed',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    backgroundColor: '#a78bfa',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
