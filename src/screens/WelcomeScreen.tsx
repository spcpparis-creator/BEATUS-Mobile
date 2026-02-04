import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Linking as RNLinking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import Constants from 'expo-constants';
import { useAuth } from '../contexts/AuthContext';
import { GOOGLE_CLIENT_ID, COLORS, API_BASE_URL } from '../config/api';

// URL du frontend web pour la redirection OAuth
const WEB_FRONTEND_URL = 'https://beatus-gamma.vercel.app';

// Fonction pour obtenir l'URL de redirection correcte
const getRedirectUrl = () => {
  // Utiliser expo-linking pour créer l'URL correcte
  try {
    // Pour Expo Go, créer une URL avec le scheme exp
    const isExpoGo = Constants.appOwnership === 'expo' || !Constants.appOwnership;
    
    if (isExpoGo && Constants.experienceUrl) {
      // Utiliser l'URL de l'expérience Expo
      const baseUrl = Constants.experienceUrl.replace(/\/$/, '');
      return `${baseUrl}/--/auth`;
    }
    
    // Pour un build standalone, utiliser le scheme custom via Linking
    return Linking.createURL('/auth');
  } catch (error) {
    console.error('Erreur création URL:', error);
    // Fallback vers le scheme custom
    return 'beatus://auth';
  }
};

interface InvitationData {
  id: string;
  code: string;
  type: 'team_leader' | 'technician';
  tenantId: string;
  createdBy: string;
  creatorName: string;
}

export default function WelcomeScreen() {
  const { loginWithGoogle, loginWithGoogleAndInvitation, login } = useAuth();
  const [mode, setMode] = useState<'choice' | 'login' | 'invitation'>('choice');
  const [invitationCode, setInvitationCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [validatedInvitation, setValidatedInvitation] = useState<InvitationData | null>(null);

  // Écouter les deep links pour le retour OAuth
  useEffect(() => {
    const handleDeepLink = async (event: { url: string }) => {
      console.log('Deep link reçu:', event.url);
      
      // Parser l'URL pour extraire le token
      // Gérer les deux formats: exp://...?token=... et beatus://auth?token=...
      let token: string | null = null;
      let userJson: string | null = null;
      
      try {
        // Essayer de parser avec URL standard
        const url = new URL(event.url);
        token = url.searchParams.get('token');
        userJson = url.searchParams.get('user');
      } catch {
        // Si ça échoue (format exp://), extraire manuellement
        const queryStart = event.url.indexOf('?');
        if (queryStart !== -1) {
          const queryString = event.url.substring(queryStart + 1);
          const params = new URLSearchParams(queryString);
          token = params.get('token');
          userJson = params.get('user');
        }
      }
      
      if (token && userJson) {
        try {
          const user = JSON.parse(decodeURIComponent(userJson));
          
          // Vérifier le rôle
          if (user.role !== 'technician' && user.role !== 'team_leader') {
            Alert.alert('Accès refusé', 'Cette application est réservée aux techniciens et chefs d\'équipe.');
            return;
          }
          
          await login(token, user);
        } catch (error) {
          console.error('Erreur parsing user:', error);
          Alert.alert('Erreur', 'Impossible de traiter la connexion');
        }
      }
    };

    // Écouter les liens entrants
    const subscription = RNLinking.addEventListener('url', handleDeepLink);
    
    // Vérifier si l'app a été ouverte avec un lien
    RNLinking.getInitialURL().then((url) => {
      if (url) {
        handleDeepLink({ url });
      }
    });

    return () => {
      subscription.remove();
    };
  }, [login]);

  const handleGooglePress = async () => {
    setIsLoading(true);
    try {
      // Obtenir l'URL de redirection correcte pour l'environnement actuel
      const redirectUrl = getRedirectUrl();
      console.log('Redirect URL pour OAuth:', redirectUrl);
      
      // Construire l'URL d'authentification via le frontend web
      // Le frontend gèrera l'OAuth et redirigera vers l'app avec le token
      let authUrl = `${WEB_FRONTEND_URL}/auth/mobile-oauth?`;
      authUrl += `redirect=${encodeURIComponent(redirectUrl)}`;
      
      if (validatedInvitation) {
        authUrl += `&invitationCode=${validatedInvitation.code}`;
        authUrl += `&role=${validatedInvitation.type}`;
        authUrl += `&tenantId=${validatedInvitation.tenantId}`;
      }

      console.log('Opening auth URL:', authUrl);

      // Ouvrir le navigateur
      const result = await WebBrowser.openBrowserAsync(authUrl);
      console.log('Browser result:', result);
      
    } catch (error: any) {
      console.error('Erreur Google Auth:', error);
      Alert.alert(
        'Erreur de connexion',
        error.message || 'Impossible de se connecter avec Google'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const validateInvitationCode = async () => {
    if (!invitationCode.trim()) {
      Alert.alert('Erreur', 'Veuillez entrer un code d\'invitation');
      return;
    }

    setIsValidating(true);
    try {
      const response = await fetch(`${API_BASE_URL}/invitations/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: invitationCode.trim() }),
      });

      const data = await response.json();

      if (!response.ok || !data.valid) {
        Alert.alert('Code invalide', data.error || 'Ce code d\'invitation n\'est pas valide');
        return;
      }

      setValidatedInvitation(data.invitation);
      
      const roleLabel = data.invitation.type === 'team_leader' ? 'Chef d\'équipe' : 'Technicien';
      Alert.alert(
        'Code validé ✓',
        `Vous êtes invité en tant que ${roleLabel} par ${data.invitation.creatorName}.\n\nConnectez-vous avec Google pour créer votre compte.`,
        [{ text: 'Continuer' }]
      );
    } catch (error: any) {
      Alert.alert('Erreur', 'Impossible de valider le code. Vérifiez votre connexion internet.');
    } finally {
      setIsValidating(false);
    }
  };

  const formatInvitationCode = (text: string) => {
    const cleaned = text.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (cleaned.length <= 3) {
      return cleaned;
    }
    return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 6)}`;
  };

  const renderChoiceMode = () => (
    <View style={styles.content}>
      <Text style={styles.welcomeText}>Bienvenue</Text>
      <Text style={styles.instructionText}>
        Comment souhaitez-vous continuer ?
      </Text>

      <TouchableOpacity
        style={styles.primaryButton}
        onPress={() => setMode('login')}
      >
        <Text style={styles.primaryButtonIcon}>👤</Text>
        <View style={styles.buttonTextContainer}>
          <Text style={styles.primaryButtonText}>J'ai déjà un compte</Text>
          <Text style={styles.buttonSubtext}>Me connecter</Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.secondaryButton}
        onPress={() => setMode('invitation')}
      >
        <Text style={styles.secondaryButtonIcon}>🎟️</Text>
        <View style={styles.buttonTextContainer}>
          <Text style={styles.secondaryButtonText}>J'ai un code d'invitation</Text>
          <Text style={styles.buttonSubtextDark}>Créer mon compte</Text>
        </View>
      </TouchableOpacity>
    </View>
  );

  const renderLoginMode = () => (
    <View style={styles.content}>
      <TouchableOpacity style={styles.backButton} onPress={() => setMode('choice')}>
        <Text style={styles.backButtonText}>← Retour</Text>
      </TouchableOpacity>

      <Text style={styles.welcomeText}>Connexion</Text>
      <Text style={styles.instructionText}>
        Connectez-vous à votre compte existant
      </Text>

      <TouchableOpacity
        style={[styles.googleButton, isLoading && styles.buttonDisabled]}
        onPress={handleGooglePress}
        disabled={isLoading}
      >
        {isLoading ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <>
            <View style={styles.googleIconContainer}>
              <Text style={styles.googleIcon}>G</Text>
            </View>
            <Text style={styles.googleButtonText}>Continuer avec Google</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );

  const renderInvitationMode = () => (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.content}
    >
      <TouchableOpacity style={styles.backButton} onPress={() => {
        setMode('choice');
        setValidatedInvitation(null);
        setInvitationCode('');
      }}>
        <Text style={styles.backButtonText}>← Retour</Text>
      </TouchableOpacity>

      <Text style={styles.welcomeText}>Code d'invitation</Text>
      <Text style={styles.instructionText}>
        Entrez le code que vous avez reçu
      </Text>

      <View style={styles.codeInputContainer}>
        <TextInput
          style={styles.codeInput}
          value={invitationCode}
          onChangeText={(text) => setInvitationCode(formatInvitationCode(text))}
          placeholder="ABC-123"
          placeholderTextColor="#94a3b8"
          maxLength={7}
          autoCapitalize="characters"
          autoCorrect={false}
          editable={!validatedInvitation}
        />
        {!validatedInvitation ? (
          <TouchableOpacity
            style={[styles.validateButton, isValidating && styles.buttonDisabled]}
            onPress={validateInvitationCode}
            disabled={isValidating}
          >
            {isValidating ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.validateButtonText}>Valider</Text>
            )}
          </TouchableOpacity>
        ) : (
          <View style={styles.validatedBadge}>
            <Text style={styles.validatedBadgeText}>✓</Text>
          </View>
        )}
      </View>

      {validatedInvitation && (
        <View style={styles.invitationInfo}>
          <Text style={styles.invitationInfoTitle}>
            {validatedInvitation.type === 'team_leader' ? '👔 Chef d\'équipe' : '🔧 Technicien'}
          </Text>
          <Text style={styles.invitationInfoText}>
            Invité par {validatedInvitation.creatorName}
          </Text>

          <TouchableOpacity
            style={[styles.googleButton, styles.googleButtonMargin, isLoading && styles.buttonDisabled]}
            onPress={handleGooglePress}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <View style={styles.googleIconContainer}>
                  <Text style={styles.googleIcon}>G</Text>
                </View>
                <Text style={styles.googleButtonText}>Créer mon compte avec Google</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}
    </KeyboardAvoidingView>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.logo}>BEATUS</Text>
        <Text style={styles.subtitle}>Application Mobile</Text>
      </View>

      {mode === 'choice' && renderChoiceMode()}
      {mode === 'login' && renderLoginMode()}
      {mode === 'invitation' && renderInvitationMode()}

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Réservé aux techniciens et chefs d'équipe
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    paddingTop: 50,
    paddingBottom: 30,
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
  },
  logo: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#fff',
    letterSpacing: 3,
  },
  subtitle: {
    fontSize: 16,
    color: '#e0e7ff',
    marginTop: 8,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 40,
  },
  backButton: {
    marginBottom: 20,
  },
  backButtonText: {
    fontSize: 16,
    color: COLORS.primary,
    fontWeight: '500',
  },
  welcomeText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 8,
  },
  instructionText: {
    fontSize: 16,
    color: COLORS.textMuted,
    marginBottom: 40,
    lineHeight: 24,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingVertical: 20,
    paddingHorizontal: 20,
    borderRadius: 16,
    marginBottom: 16,
  },
  primaryButtonIcon: {
    fontSize: 28,
    marginRight: 16,
  },
  buttonTextContainer: {
    flex: 1,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  buttonSubtext: {
    color: '#bfdbfe',
    fontSize: 14,
    marginTop: 2,
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    paddingVertical: 20,
    paddingHorizontal: 20,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: COLORS.border,
  },
  secondaryButtonIcon: {
    fontSize: 28,
    marginRight: 16,
  },
  secondaryButtonText: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: '600',
  },
  buttonSubtextDark: {
    color: COLORS.textMuted,
    fontSize: 14,
    marginTop: 2,
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4285f4',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 16,
    shadowColor: '#4285f4',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  googleButtonMargin: {
    marginTop: 20,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  googleIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  googleIcon: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#4285f4',
  },
  googleButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  codeInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  codeInput: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 20,
    fontSize: 24,
    fontWeight: 'bold',
    letterSpacing: 4,
    color: COLORS.text,
    textAlign: 'center',
  },
  validateButton: {
    marginLeft: 12,
    backgroundColor: COLORS.primary,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  validateButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  validatedBadge: {
    marginLeft: 12,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: COLORS.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  validatedBadgeText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
  },
  invitationInfo: {
    backgroundColor: '#ecfdf5',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
  },
  invitationInfoTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 8,
  },
  invitationInfoText: {
    fontSize: 14,
    color: COLORS.textMuted,
  },
  footer: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
});
