import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Share,
  ScrollView,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { COLORS, API_BASE_URL } from '../../config/api';
import * as SecureStore from 'expo-secure-store';
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

export default function InviteTechnicianScreen({ navigation }: Props) {
  const [loading, setLoading] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [invitationCode, setInvitationCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [teamLeader, setTeamLeader] = useState<any>(null);
  const [activities, setActivities] = useState<any[]>([]);
  const [selectedSectors, setSelectedSectors] = useState<string[]>([]);
  const [selectedActivities, setSelectedActivities] = useState<string[]>([]);
  const [commissionPercentage, setCommissionPercentage] = useState<number>(30);
  const [email, setEmail] = useState('');
  const [showSectorSelection, setShowSectorSelection] = useState(false);
  const [showActivitySelection, setShowActivitySelection] = useState(false);
  const [showCommissionSelection, setShowCommissionSelection] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [profileData, activitiesData] = await Promise.all([
        api.getTeamLeaderMe(),
        api.getActivities().catch(() => ({ data: { activities: [] } })),
      ]);
      
      const tl = profileData.data || profileData;
      setTeamLeader(tl);
      
      // Initialiser la commission avec celle par défaut du TL
      setCommissionPercentage(tl.defaultTechnicianCommission ?? 30);
      
      // Charger les activités
      // getActivities() retourne directement un tableau, pas { data: { activities: [] } }
      const acts = Array.isArray(activitiesData) 
        ? activitiesData 
        : (activitiesData?.data?.activities || activitiesData?.activities || []);
      setActivities(acts.filter((a: any) => a.isActive !== false));
    } catch (error) {
      console.error('Erreur chargement données:', error);
    } finally {
      setLoadingProfile(false);
    }
  };

  const toggleSector = (code: string) => {
    setSelectedSectors(prev => 
      prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
    );
  };

  const toggleActivity = (id: string) => {
    setSelectedActivities(prev => 
      prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]
    );
  };

  const generateCode = async () => {
    // Vérifier que la commission ne dépasse pas celle du TL
    const tlMaxCommission = teamLeader?.commissionFromAdmin ?? teamLeader?.commission_from_admin ?? 100;
    if (commissionPercentage > tlMaxCommission) {
      Alert.alert('Erreur', `La commission ne peut pas dépasser ${tlMaxCommission}% (votre commission de l'admin).`);
      return;
    }

    setLoading(true);
    try {
      const token = await SecureStore.getItemAsync('authToken');
      const response = await fetch(`${API_BASE_URL}/invitations/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ 
          type: 'technician',
          email: email.trim() || undefined,
          commissionPercentage: commissionPercentage,
          selectedDepartments: selectedSectors.length > 0 ? selectedSectors : undefined,
          activityIds: selectedActivities.length > 0 ? selectedActivities : undefined,
          // Le billingType sera hérité du team leader côté backend
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Erreur serveur' }));
        throw new Error(errorData.error || 'Erreur lors de la génération');
      }

      const data = await response.json();
      const code = data.invitation?.code || data.code;
      if (!code) {
        throw new Error('Code non reçu du serveur');
      }
      setInvitationCode(code);
    } catch (error: any) {
      console.error('Erreur génération code:', error);
      Alert.alert('Erreur', error.message || 'Impossible de générer le code');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async () => {
    if (invitationCode) {
      await Clipboard.setStringAsync(invitationCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const shareCode = async () => {
    if (invitationCode) {
      try {
        const sectorInfo = selectedSectors.length > 0
          ? `\nSecteurs: ${selectedSectors.map(c => `${c} - ${FRENCH_DEPARTMENTS[c] || c}`).join(', ')}`
          : '';
        await Share.share({
          message: `Rejoignez mon équipe sur BEATUS !\n\nCode d'invitation : ${invitationCode}${sectorInfo}\n\nTéléchargez l'application et utilisez ce code pour vous inscrire.`,
        });
      } catch (error) {
        console.error('Erreur partage:', error);
      }
    }
  };

  const resetForm = () => {
    setInvitationCode(null);
    setSelectedSectors([]);
    setSelectedActivities([]);
    setCommissionPercentage(teamLeader?.defaultTechnicianCommission ?? 30);
    setEmail('');
    setShowSectorSelection(false);
    setShowActivitySelection(false);
    setShowCommissionSelection(false);
  };

  const tlDepartments = teamLeader?.selectedDepartments || [];
  const tlActivities = teamLeader?.activityIds || [];
  
  // Presets de commission (plafonnés à la commission du TL)
  const maxCommission = teamLeader?.commissionFromAdmin ?? teamLeader?.commission_from_admin ?? 100;
  const commissionPresets = [10, 15, 20, 25, 30, 35, 40, 50].filter(v => v <= maxCommission);

  if (loadingProfile) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Retour</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Inviter un technicien</Text>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {!invitationCode ? (
          <>
            <View style={styles.iconContainer}>
              <Text style={styles.icon}>👥</Text>
            </View>
            <Text style={styles.description}>
              Générez un code d'invitation à partager avec votre nouveau technicien.
              Il pourra l'utiliser pour créer son compte et rejoindre votre équipe.
            </Text>

            {/* Email (optionnel) */}
            <View style={styles.inputSection}>
              <Text style={styles.inputLabel}>Email du technicien (optionnel)</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="technicien@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            {/* Commission */}
            <View style={styles.inputSection}>
              <Text style={styles.inputLabel}>💰 Commission du technicien</Text>
              <Text style={styles.inputHint}>
                Pourcentage que le technicien recevra sur chaque intervention
              </Text>
              
              {showCommissionSelection ? (
                <View style={styles.selectionGrid}>
                  <View style={styles.presetsRow}>
                    {commissionPresets.map((preset) => (
                      <TouchableOpacity
                        key={preset}
                        style={[
                          styles.presetButton,
                          commissionPercentage === preset && styles.presetButtonSelected
                        ]}
                        onPress={() => {
                          setCommissionPercentage(preset);
                          setShowCommissionSelection(false);
                        }}
                      >
                        <Text style={[
                          styles.presetButtonText,
                          commissionPercentage === preset && styles.presetButtonTextSelected
                        ]}>
                          {preset}%
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <View style={styles.customInputRow}>
                    <TextInput
                      style={styles.customInput}
                      value={String(commissionPercentage)}
                      onChangeText={(text) => {
                        const num = parseInt(text) || 0;
                        setCommissionPercentage(Math.min(100, Math.max(0, num)));
                      }}
                      keyboardType="numeric"
                      placeholder="Personnalisé"
                    />
                    <Text style={styles.percentSign}>%</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.doneButton}
                    onPress={() => setShowCommissionSelection(false)}
                  >
                    <Text style={styles.doneButtonText}>✓ Valider</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.selectButton}
                  onPress={() => setShowCommissionSelection(true)}
                >
                  <Text style={styles.selectButtonValue}>{commissionPercentage}%</Text>
                  <Text style={styles.selectButtonHint}>Modifier</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Sélection de secteurs (multi) */}
            {tlDepartments.length > 0 && (
              <View style={styles.inputSection}>
                <Text style={styles.inputLabel}>📍 Secteurs d'intervention</Text>
                <Text style={styles.inputHint}>
                  Sélectionnez les secteurs où le technicien pourra intervenir
                </Text>
                
                {showSectorSelection ? (
                  <View style={styles.selectionGrid}>
                    {tlDepartments.map((code: string) => (
                      <TouchableOpacity
                        key={code}
                        style={[
                          styles.sectorButton,
                          selectedSectors.includes(code) && styles.sectorButtonSelected
                        ]}
                        onPress={() => toggleSector(code)}
                      >
                        <Text style={[
                          styles.sectorButtonText,
                          selectedSectors.includes(code) && styles.sectorButtonTextSelected
                        ]}>
                          {selectedSectors.includes(code) ? '✓ ' : ''}{code} - {FRENCH_DEPARTMENTS[code] || code}
                        </Text>
                      </TouchableOpacity>
                    ))}
                    <TouchableOpacity
                      style={styles.doneButton}
                      onPress={() => setShowSectorSelection(false)}
                    >
                      <Text style={styles.doneButtonText}>✓ Valider ({selectedSectors.length} sélectionnés)</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.selectButton}
                    onPress={() => setShowSectorSelection(true)}
                  >
                    {selectedSectors.length > 0 ? (
                      <View style={styles.selectedBadges}>
                        {selectedSectors.slice(0, 3).map(code => (
                          <View key={code} style={styles.miniTag}>
                            <Text style={styles.miniTagText}>{code}</Text>
                          </View>
                        ))}
                        {selectedSectors.length > 3 && (
                          <Text style={styles.moreText}>+{selectedSectors.length - 3}</Text>
                        )}
                      </View>
                    ) : (
                      <Text style={styles.selectButtonPlaceholder}>+ Sélectionner les secteurs</Text>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* Sélection d'activités */}
            {activities.length > 0 && (
              <View style={styles.inputSection}>
                <Text style={styles.inputLabel}>🔧 Activités / Spécialités</Text>
                <Text style={styles.inputHint}>
                  Types d'interventions que le technicien peut réaliser
                </Text>
                
                {showActivitySelection ? (
                  <View style={styles.selectionGrid}>
                    {activities.map((activity: any) => (
                      <TouchableOpacity
                        key={activity.id}
                        style={[
                          styles.sectorButton,
                          selectedActivities.includes(activity.id) && styles.activityButtonSelected
                        ]}
                        onPress={() => toggleActivity(activity.id)}
                      >
                        <Text style={[
                          styles.sectorButtonText,
                          selectedActivities.includes(activity.id) && styles.sectorButtonTextSelected
                        ]}>
                          {selectedActivities.includes(activity.id) ? '✓ ' : ''}{activity.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                    <TouchableOpacity
                      style={styles.doneButton}
                      onPress={() => setShowActivitySelection(false)}
                    >
                      <Text style={styles.doneButtonText}>✓ Valider ({selectedActivities.length} sélectionnées)</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.selectButton}
                    onPress={() => setShowActivitySelection(true)}
                  >
                    {selectedActivities.length > 0 ? (
                      <View style={styles.selectedBadges}>
                        {selectedActivities.slice(0, 2).map(id => {
                          const act = activities.find((a: any) => a.id === id);
                          return act ? (
                            <View key={id} style={styles.miniTagGreen}>
                              <Text style={styles.miniTagTextGreen}>{act.name}</Text>
                            </View>
                          ) : null;
                        })}
                        {selectedActivities.length > 2 && (
                          <Text style={styles.moreText}>+{selectedActivities.length - 2}</Text>
                        )}
                      </View>
                    ) : (
                      <Text style={styles.selectButtonPlaceholder}>+ Sélectionner les activités</Text>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* Info sur les paramètres hérités */}
            <View style={styles.inheritedInfo}>
              <Text style={styles.inheritedTitle}>📋 Type de facturation (hérité)</Text>
              <View style={styles.inheritedItem}>
                <Text style={styles.inheritedLabel}>Mode:</Text>
                <Text style={styles.inheritedValue}>
                  {teamLeader?.billingType === 'self' ? 'Auto-facturation' : 'Facturation SPCP'}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.generateButton}
              onPress={generateCode}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.generateButtonText}>Générer le code d'invitation</Text>
              )}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <View style={styles.successIconContainer}>
              <Text style={styles.successIcon}>✓</Text>
            </View>
            <Text style={styles.successTitle}>Code généré !</Text>
            
            <View style={styles.codeContainer}>
              <Text style={styles.codeLabel}>Code d'invitation</Text>
              <Text style={styles.code}>{invitationCode}</Text>
              
              {/* Résumé des paramètres configurés */}
              <View style={styles.configSummary}>
                <View style={styles.configItem}>
                  <Text style={styles.configLabel}>💰 Commission:</Text>
                  <Text style={styles.configValue}>{commissionPercentage}%</Text>
                </View>
                {selectedSectors.length > 0 && (
                  <View style={styles.configItem}>
                    <Text style={styles.configLabel}>📍 Secteurs:</Text>
                    <Text style={styles.configValue}>{selectedSectors.join(', ')}</Text>
                  </View>
                )}
                {selectedActivities.length > 0 && (
                  <View style={styles.configItem}>
                    <Text style={styles.configLabel}>🔧 Activités:</Text>
                    <Text style={styles.configValue}>
                      {selectedActivities.map(id => {
                        const act = activities.find((a: any) => a.id === id);
                        return act?.name || id;
                      }).join(', ')}
                    </Text>
                  </View>
                )}
              </View>
            </View>

            <View style={styles.actionsContainer}>
              <TouchableOpacity style={styles.actionButton} onPress={copyToClipboard}>
                <Text style={styles.actionIcon}>{copied ? '✓' : '📋'}</Text>
                <Text style={styles.actionText}>{copied ? 'Copié !' : 'Copier'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionButton} onPress={shareCode}>
                <Text style={styles.actionIcon}>📤</Text>
                <Text style={styles.actionText}>Partager</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.infoCard}>
              <Text style={styles.infoTitle}>ℹ️ Comment ça marche ?</Text>
              <Text style={styles.infoText}>
                1. Partagez ce code avec votre technicien{'\n'}
                2. Il télécharge l'application BEATUS{'\n'}
                3. Il choisit "J'ai un code d'invitation"{'\n'}
                4. Il entre le code et crée son compte{'\n'}
                5. Il rejoint automatiquement votre équipe !
              </Text>
            </View>

            <TouchableOpacity
              style={styles.newCodeButton}
              onPress={resetForm}
            >
              <Text style={styles.newCodeButtonText}>Générer un autre code</Text>
            </TouchableOpacity>
          </>
        )}
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    alignItems: 'center',
  },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#f5f3ff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    marginTop: 10,
  },
  icon: {
    fontSize: 48,
  },
  description: {
    fontSize: 16,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
  },
  inputSection: {
    width: '100%',
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8,
  },
  inputHint: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginBottom: 8,
  },
  input: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
  },
  selectSectorButton: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 16,
    minHeight: 52,
    justifyContent: 'center',
  },
  selectSectorText: {
    color: COLORS.primary,
    fontSize: 15,
    fontWeight: '500',
  },
  selectedSectorDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectedSectorBadge: {
    flex: 1,
  },
  selectedSectorText: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '500',
  },
  changeSectorButton: {
    padding: 4,
  },
  changeSectorText: {
    color: COLORS.textMuted,
    fontSize: 18,
  },
  sectorGrid: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sectorButton: {
    backgroundColor: '#f1f5f9',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 8,
  },
  sectorButtonSelected: {
    backgroundColor: '#7c3aed',
  },
  sectorButtonText: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '500',
  },
  sectorButtonTextSelected: {
    color: '#fff',
  },
  cancelSectorButton: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  cancelSectorText: {
    color: COLORS.textMuted,
    fontSize: 14,
  },
  inheritedInfo: {
    backgroundColor: '#f5f3ff',
    borderRadius: 12,
    padding: 16,
    width: '100%',
    marginBottom: 24,
  },
  inheritedTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#7c3aed',
    marginBottom: 8,
  },
  inheritedText: {
    fontSize: 13,
    color: COLORS.text,
    marginBottom: 12,
  },
  inheritedItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  inheritedLabel: {
    fontSize: 13,
    color: COLORS.textMuted,
  },
  inheritedValue: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.text,
  },
  generateButton: {
    backgroundColor: '#7c3aed',
    paddingVertical: 16,
    paddingHorizontal: 40,
    borderRadius: 14,
    minWidth: 250,
    alignItems: 'center',
  },
  generateButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  successIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#dcfce7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    marginTop: 20,
  },
  successIcon: {
    fontSize: 40,
    color: COLORS.success,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.success,
    marginBottom: 24,
  },
  codeContainer: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    width: '100%',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  codeLabel: {
    fontSize: 14,
    color: COLORS.textMuted,
    marginBottom: 8,
  },
  code: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#7c3aed',
    letterSpacing: 4,
  },
  codeSectorBadge: {
    marginTop: 16,
    backgroundColor: '#f5f3ff',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  codeSectorText: {
    color: '#7c3aed',
    fontSize: 14,
    fontWeight: '500',
  },
  actionsContainer: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 24,
  },
  actionButton: {
    backgroundColor: COLORS.card,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  actionIcon: {
    fontSize: 18,
  },
  actionText: {
    fontSize: 16,
    fontWeight: '500',
    color: COLORS.text,
  },
  infoCard: {
    backgroundColor: '#f5f3ff',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    marginBottom: 24,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#7c3aed',
    marginBottom: 12,
  },
  infoText: {
    fontSize: 14,
    color: COLORS.text,
    lineHeight: 24,
  },
  newCodeButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  newCodeButtonText: {
    color: '#7c3aed',
    fontSize: 16,
    fontWeight: '500',
  },
  // New styles for enhanced form
  selectionGrid: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  presetsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  presetButton: {
    backgroundColor: '#f1f5f9',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    minWidth: 60,
    alignItems: 'center',
  },
  presetButtonSelected: {
    backgroundColor: '#7c3aed',
  },
  presetButtonText: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '600',
  },
  presetButtonTextSelected: {
    color: '#fff',
  },
  customInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  customInput: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    fontWeight: '600',
  },
  percentSign: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
  },
  doneButton: {
    backgroundColor: '#22c55e',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 12,
  },
  doneButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  selectButton: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 16,
    minHeight: 52,
    justifyContent: 'center',
  },
  selectButtonValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#7c3aed',
  },
  selectButtonHint: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  selectButtonPlaceholder: {
    color: '#7c3aed',
    fontSize: 15,
    fontWeight: '500',
  },
  selectedBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
  },
  miniTag: {
    backgroundColor: '#ede9fe',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  miniTagText: {
    color: '#7c3aed',
    fontSize: 13,
    fontWeight: '500',
  },
  miniTagGreen: {
    backgroundColor: '#dcfce7',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  miniTagTextGreen: {
    color: '#16a34a',
    fontSize: 13,
    fontWeight: '500',
  },
  moreText: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontWeight: '500',
  },
  activityButtonSelected: {
    backgroundColor: '#22c55e',
  },
  configSummary: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    width: '100%',
  },
  configItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  configLabel: {
    fontSize: 13,
    color: COLORS.textMuted,
  },
  configValue: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.text,
    maxWidth: '60%',
    textAlign: 'right',
  },
});
