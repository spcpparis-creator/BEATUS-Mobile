import React, { useState } from 'react';
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
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, API_BASE_URL } from '../config/api';

type Step = 'email' | 'code' | 'password' | 'success';

interface ForgotPasswordScreenProps {
  onBack: () => void;
}

export default function ForgotPasswordScreen({ onBack }: ForgotPasswordScreenProps) {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [maskedEmail, setMaskedEmail] = useState('');

  const handleSendCode = async () => {
    if (!email.trim()) {
      Alert.alert('Erreur', 'Veuillez entrer votre adresse email');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });

      const data = await response.json();

      if (!response.ok && data.error) {
        Alert.alert('Erreur', data.error);
        return;
      }

      setMaskedEmail(data.maskedEmail || '');
      setStep('code');
    } catch (error: any) {
      Alert.alert('Erreur', 'Impossible d\'envoyer l\'email. Vérifiez votre connexion.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    if (code.length !== 6) {
      Alert.alert('Erreur', 'Veuillez entrer le code à 6 chiffres');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/auth/verify-reset-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });

      const data = await response.json();

      if (!data.valid) {
        Alert.alert('Code invalide', data.error || 'Ce code est invalide ou expiré');
        return;
      }

      setStep('password');
    } catch (error: any) {
      Alert.alert('Erreur', 'Impossible de vérifier le code. Réessayez.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (password.length < 6) {
      Alert.alert('Erreur', 'Le mot de passe doit contenir au moins 6 caractères');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Erreur', 'Les mots de passe ne correspondent pas');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        Alert.alert('Erreur', data.error || 'Impossible de réinitialiser le mot de passe');
        return;
      }

      setStep('success');
    } catch (error: any) {
      Alert.alert('Erreur', 'Une erreur est survenue. Réessayez.');
    } finally {
      setLoading(false);
    }
  };

  const renderEmailStep = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Mot de passe oublié</Text>
      <Text style={styles.stepDescription}>
        Entrez votre adresse email pour recevoir un code de réinitialisation.
      </Text>

      <TextInput
        style={styles.input}
        value={email}
        onChangeText={setEmail}
        placeholder="email@exemple.com"
        placeholderTextColor="#94a3b8"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus
      />

      <TouchableOpacity
        style={[styles.primaryButton, loading && styles.buttonDisabled]}
        onPress={handleSendCode}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Text style={styles.primaryButtonText}>Envoyer le code</Text>
        )}
      </TouchableOpacity>
    </View>
  );

  const renderCodeStep = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Vérification</Text>
      <Text style={styles.stepDescription}>
        Un code à 6 chiffres a été envoyé à{'\n'}
        <Text style={styles.emailHighlight}>{maskedEmail || '***'}</Text>
      </Text>

      <TextInput
        style={styles.codeInput}
        value={code}
        onChangeText={(text) => setCode(text.replace(/[^0-9]/g, '').slice(0, 6))}
        placeholder="000000"
        placeholderTextColor="#94a3b8"
        keyboardType="number-pad"
        maxLength={6}
        autoFocus
      />

      <TouchableOpacity
        style={[styles.primaryButton, loading && styles.buttonDisabled]}
        onPress={handleVerifyCode}
        disabled={loading || code.length !== 6}
      >
        {loading ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Text style={styles.primaryButtonText}>Vérifier le code</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.resendButton}
        onPress={() => {
          setCode('');
          handleSendCode();
        }}
      >
        <Text style={styles.resendButtonText}>Renvoyer le code</Text>
      </TouchableOpacity>
    </View>
  );

  const renderPasswordStep = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Nouveau mot de passe</Text>
      <Text style={styles.stepDescription}>
        Choisissez un nouveau mot de passe pour votre compte.
      </Text>

      <TextInput
        style={styles.input}
        value={password}
        onChangeText={setPassword}
        placeholder="Nouveau mot de passe"
        placeholderTextColor="#94a3b8"
        secureTextEntry
        autoFocus
      />

      <TextInput
        style={styles.input}
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        placeholder="Confirmer le mot de passe"
        placeholderTextColor="#94a3b8"
        secureTextEntry
      />

      {confirmPassword.length > 0 && password !== confirmPassword && (
        <Text style={styles.errorText}>Les mots de passe ne correspondent pas</Text>
      )}

      <TouchableOpacity
        style={[
          styles.primaryButton,
          (loading || password.length < 6 || password !== confirmPassword) && styles.buttonDisabled,
        ]}
        onPress={handleResetPassword}
        disabled={loading || password.length < 6 || password !== confirmPassword}
      >
        {loading ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Text style={styles.primaryButtonText}>Réinitialiser le mot de passe</Text>
        )}
      </TouchableOpacity>
    </View>
  );

  const renderSuccessStep = () => (
    <View style={styles.stepContainer}>
      <View style={styles.successIcon}>
        <Text style={styles.successIconText}>✓</Text>
      </View>
      <Text style={styles.stepTitle}>Mot de passe modifié</Text>
      <Text style={styles.stepDescription}>
        Votre mot de passe a été réinitialisé avec succès.
        Vous pouvez maintenant vous connecter.
      </Text>

      <TouchableOpacity style={styles.primaryButton} onPress={onBack}>
        <Text style={styles.primaryButtonText}>Retour à la connexion</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.logo}>BEATUS</Text>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.content}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {step !== 'success' && (
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => {
                if (step === 'code') setStep('email');
                else if (step === 'password') setStep('code');
                else onBack();
              }}
            >
              <Text style={styles.backButtonText}>← Retour</Text>
            </TouchableOpacity>
          )}

          {step === 'email' && renderEmailStep()}
          {step === 'code' && renderCodeStep()}
          {step === 'password' && renderPasswordStep()}
          {step === 'success' && renderSuccessStep()}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    paddingTop: 30,
    paddingBottom: 20,
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
  },
  logo: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#fff',
    letterSpacing: 3,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 40,
  },
  backButton: {
    marginBottom: 16,
  },
  backButtonText: {
    fontSize: 16,
    color: COLORS.primary,
    fontWeight: '500',
  },
  stepContainer: {
    paddingTop: 8,
  },
  stepTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 8,
  },
  stepDescription: {
    fontSize: 15,
    color: COLORS.textMuted,
    marginBottom: 32,
    lineHeight: 22,
  },
  emailHighlight: {
    fontWeight: '600',
    color: COLORS.text,
  },
  input: {
    backgroundColor: COLORS.card,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 16,
    color: COLORS.text,
    marginBottom: 16,
  },
  codeInput: {
    backgroundColor: COLORS.card,
    borderWidth: 2,
    borderColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 18,
    paddingHorizontal: 20,
    fontSize: 28,
    fontWeight: 'bold',
    letterSpacing: 8,
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 24,
  },
  primaryButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  resendButton: {
    marginTop: 20,
    alignItems: 'center',
  },
  resendButtonText: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: '500',
  },
  errorText: {
    color: COLORS.danger,
    fontSize: 13,
    marginBottom: 8,
    marginTop: -8,
  },
  successIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.success,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 20,
  },
  successIconText: {
    color: '#fff',
    fontSize: 36,
    fontWeight: 'bold',
  },
});
