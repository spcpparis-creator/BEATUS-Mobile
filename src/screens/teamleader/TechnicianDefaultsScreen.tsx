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
import { COLORS } from '../../config/api';
import api from '../../services/api';

interface Props {
  navigation: any;
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

const SPECIALTIES = [
  'Plomberie',
  'Électricité', 
  'Chauffage',
  'Climatisation',
  'Serrurerie',
  'Vitrerie',
  'Menuiserie',
  'Peinture',
];

export default function TechnicianDefaultsScreen({ navigation }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [teamLeader, setTeamLeader] = useState<any>(null);
  const [defaultCommission, setDefaultCommission] = useState('30');
  const [defaultSectors, setDefaultSectors] = useState<string[]>([]);
  const [defaultSpecialties, setDefaultSpecialties] = useState<string[]>([]);
  const [showSectorPicker, setShowSectorPicker] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const data = await api.getTeamLeaderMe();
      const tl = data.data || data;
      setTeamLeader(tl);
      setDefaultCommission(String(tl.defaultTechnicianCommission || 30));
      // Les secteurs par défaut sont ceux du team leader
      setDefaultSectors(tl.selectedDepartments || []);
    } catch (error) {
      console.error('Erreur chargement paramètres:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    const commission = parseInt(defaultCommission);
    if (isNaN(commission) || commission < 0 || commission > 100) {
      Alert.alert('Erreur', 'La commission doit être entre 0 et 100');
      return;
    }

    setSaving(true);
    try {
      await api.updateTeamLeader(teamLeader.id, {
        defaultTechnicianCommission: commission,
      });
      Alert.alert('Succès', 'Paramètres par défaut mis à jour');
      navigation.goBack();
    } catch (error: any) {
      Alert.alert('Erreur', error.message || 'Impossible de sauvegarder');
    } finally {
      setSaving(false);
    }
  };

  const toggleSector = (code: string) => {
    setDefaultSectors(prev =>
      prev.includes(code)
        ? prev.filter(s => s !== code)
        : [...prev, code]
    );
  };

  const toggleSpecialty = (specialty: string) => {
    setDefaultSpecialties(prev =>
      prev.includes(specialty)
        ? prev.filter(s => s !== specialty)
        : [...prev, specialty]
    );
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

  const availableSectors = teamLeader?.selectedDepartments || [];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Retour</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Paramètres techniciens</Text>
        <Text style={styles.subtitle}>Valeurs par défaut pour nouveaux techniciens</Text>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Commission par défaut */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>💰 Commission par défaut</Text>
          <Text style={styles.sectionDescription}>
            Cette commission sera appliquée aux nouveaux techniciens
          </Text>
          <View style={styles.commissionRow}>
            <TextInput
              style={styles.commissionInput}
              value={defaultCommission}
              onChangeText={setDefaultCommission}
              keyboardType="numeric"
              maxLength={3}
            />
            <Text style={styles.commissionPercent}>%</Text>
            <View style={styles.commissionSlider}>
              {[10, 20, 30, 40, 50].map(val => (
                <TouchableOpacity
                  key={val}
                  style={[
                    styles.commissionPreset,
                    parseInt(defaultCommission) === val && styles.commissionPresetActive
                  ]}
                  onPress={() => setDefaultCommission(String(val))}
                >
                  <Text style={[
                    styles.commissionPresetText,
                    parseInt(defaultCommission) === val && styles.commissionPresetTextActive
                  ]}>
                    {val}%
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <View style={styles.infoCard}>
            <Text style={styles.infoText}>
              ℹ️ Vous pourrez modifier la commission individuellement pour chaque technicien
            </Text>
          </View>
        </View>

        {/* Secteurs par défaut */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📍 Secteurs disponibles</Text>
          <Text style={styles.sectionDescription}>
            Vos secteurs d'intervention (définis dans votre profil)
          </Text>
          
          {availableSectors.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>
                Aucun secteur configuré. Complétez votre profil pour ajouter des secteurs.
              </Text>
            </View>
          ) : (
            <View style={styles.sectorsList}>
              {availableSectors.map((code: string) => (
                <View key={code} style={styles.sectorItem}>
                  <View style={styles.sectorBadge}>
                    <Text style={styles.sectorCode}>{code}</Text>
                  </View>
                  <Text style={styles.sectorName}>
                    {FRENCH_DEPARTMENTS[code] || code}
                  </Text>
                </View>
              ))}
            </View>
          )}
          
          <Text style={styles.sectorNote}>
            💡 Lors de l'invitation d'un technicien, vous pourrez lui assigner un secteur spécifique
          </Text>
        </View>

        {/* Spécialités suggérées */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🔧 Spécialités suggérées</Text>
          <Text style={styles.sectionDescription}>
            Sélectionnez les spécialités proposées aux nouveaux techniciens
          </Text>
          <View style={styles.specialtiesGrid}>
            {SPECIALTIES.map(specialty => (
              <TouchableOpacity
                key={specialty}
                style={[
                  styles.specialtyButton,
                  defaultSpecialties.includes(specialty) && styles.specialtyButtonActive
                ]}
                onPress={() => toggleSpecialty(specialty)}
              >
                <Text style={[
                  styles.specialtyButtonText,
                  defaultSpecialties.includes(specialty) && styles.specialtyButtonTextActive
                ]}>
                  {specialty}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Résumé */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>📋 Résumé des paramètres</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Commission par défaut:</Text>
            <Text style={styles.summaryValue}>{defaultCommission}%</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Secteurs disponibles:</Text>
            <Text style={styles.summaryValue}>{availableSectors.length}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Type de facturation:</Text>
            <Text style={styles.summaryValue}>
              {teamLeader?.billingType === 'self' ? 'Auto-facturation' : 'SPCP'}
            </Text>
          </View>
        </View>

        {/* Boutons */}
        <View style={styles.buttons}>
          <TouchableOpacity 
            style={styles.cancelButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.cancelButtonText}>Annuler</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.saveButton}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.saveButtonText}>Enregistrer</Text>
            )}
          </TouchableOpacity>
        </View>
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
    backgroundColor: '#7c3aed',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  backButton: {
    marginBottom: 12,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  subtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 4,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  section: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 4,
  },
  sectionDescription: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginBottom: 16,
  },
  commissionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
  },
  commissionInput: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 24,
    fontWeight: 'bold',
    width: 80,
    textAlign: 'center',
    color: COLORS.text,
  },
  commissionPercent: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.textMuted,
  },
  commissionSlider: {
    flexDirection: 'row',
    gap: 8,
    flex: 1,
    justifyContent: 'flex-end',
  },
  commissionPreset: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
  },
  commissionPresetActive: {
    backgroundColor: '#7c3aed',
  },
  commissionPresetText: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.textMuted,
  },
  commissionPresetTextActive: {
    color: '#fff',
  },
  infoCard: {
    backgroundColor: '#eff6ff',
    borderRadius: 8,
    padding: 12,
    marginTop: 16,
  },
  infoText: {
    fontSize: 13,
    color: '#3b82f6',
  },
  sectorsList: {
    gap: 8,
  },
  sectorItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f3ff',
    padding: 12,
    borderRadius: 10,
  },
  sectorBadge: {
    backgroundColor: '#7c3aed',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginRight: 12,
  },
  sectorCode: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 13,
  },
  sectorName: {
    flex: 1,
    fontSize: 14,
    color: COLORS.text,
  },
  sectorNote: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 12,
    fontStyle: 'italic',
  },
  emptyState: {
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  emptyStateText: {
    fontSize: 13,
    color: COLORS.textMuted,
    textAlign: 'center',
  },
  specialtiesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  specialtyButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  specialtyButtonActive: {
    backgroundColor: '#f5f3ff',
    borderColor: '#7c3aed',
  },
  specialtyButtonText: {
    fontSize: 13,
    color: COLORS.textMuted,
  },
  specialtyButtonTextActive: {
    color: '#7c3aed',
    fontWeight: '500',
  },
  summaryCard: {
    backgroundColor: '#f5f3ff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e9d5ff',
  },
  summaryTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#7c3aed',
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  summaryLabel: {
    fontSize: 14,
    color: COLORS.textMuted,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  buttons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '600',
  },
  saveButton: {
    flex: 1,
    backgroundColor: '#7c3aed',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
