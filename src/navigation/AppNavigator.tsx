import React, { useState, useEffect } from 'react';
import { NavigationContainer, useNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, View, Alert, Linking } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useAuth } from '../contexts/AuthContext';
import { COLORS, API_BASE_URL } from '../config/api';
import * as SecureStore from 'expo-secure-store';

// Screens
import WelcomeScreen from '../screens/WelcomeScreen';
import ProfileCompletionScreen from '../screens/ProfileCompletionScreen';
import TechnicianHomeScreen from '../screens/technician/TechnicianHomeScreen';
import TechnicianSettingsScreen from '../screens/technician/TechnicianSettingsScreen';
import InterventionDetailScreen from '../screens/technician/InterventionDetailScreen';
import TeamLeaderHomeScreen from '../screens/teamleader/TeamLeaderHomeScreen';
import InviteTechnicianScreen from '../screens/teamleader/InviteTechnicianScreen';
import DocumentSettingsScreen from '../screens/teamleader/DocumentSettingsScreen';
import EmailSettingsScreen from '../screens/teamleader/EmailSettingsScreen';
import TechnicianDefaultsScreen from '../screens/teamleader/TechnicianDefaultsScreen';
import TechnicianEditScreen from '../screens/teamleader/TechnicianEditScreen';
import CreateQuoteScreen from '../screens/teamleader/CreateQuoteScreen';
import CreateInvoiceScreen from '../screens/teamleader/CreateInvoiceScreen';
import MyDocumentsScreen from '../screens/teamleader/MyDocumentsScreen';
import BillingSettingsScreen from '../screens/teamleader/BillingSettingsScreen';
import QuoteDetailScreen from '../screens/billing/QuoteDetailScreen';
import InvoiceDetailScreen from '../screens/billing/InvoiceDetailScreen';
import SumUpSettingsScreen from '../screens/shared/SumUpSettingsScreen';
import MessagingScreen from '../screens/shared/MessagingScreen';

export type RootStackParamList = {
  Welcome: undefined;
  ProfileCompletion: undefined;
  TechnicianHome: undefined;
  TechnicianSettings: undefined;
  InterventionDetail: { interventionId: string };
  TeamLeaderHome: undefined;
  InviteTechnician: undefined;
  DocumentSettings: undefined;
  EmailSettings: undefined;
  TechnicianDefaults: undefined;
  TechnicianEdit: { technician: any; teamLeader: any };
  CreateQuote: { interventionId?: string; intervention?: any };
  CreateInvoice: { interventionId?: string; intervention?: any; quoteId?: string };
  QuoteDetail: { quoteId: string };
  InvoiceDetail: { invoiceId: string };
  MyDocuments: undefined;
  BillingSettings: undefined;
  SumUpSettings: undefined;
  Messaging: { conversationId?: string; interventionId?: string; interventionRef?: string } | undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function AppNavigator() {
  const { user, isLoading } = useAuth();
  const [profileComplete, setProfileComplete] = useState<boolean | null>(null);
  const [checkingProfile, setCheckingProfile] = useState(false);
  const navigationRef = useNavigationContainerRef<RootStackParamList>();

  // Réinitialiser le badge à l'ouverture de l'app
  useEffect(() => {
    Notifications.setBadgeCountAsync(0);
  }, []);

  // Écouter le tap sur une notification → navigation vers l'intervention
  useEffect(() => {
    const handleNotificationResponse = (response: Notifications.NotificationResponse) => {
      const data = response.notification.request.content.data as { interventionId?: string };
      if (data?.interventionId && navigationRef.isReady()) {
        navigationRef.navigate('InterventionDetail', { interventionId: data.interventionId });
      }
    };

    const subscription = Notifications.addNotificationResponseReceivedListener(handleNotificationResponse);

    // App ouverte via tap sur notification (app fermée ou en background)
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) handleNotificationResponse(response);
    });

    return () => subscription.remove();
  }, []);

  // Écouter les deep links SumUp (beatus://sumup-connected, beatus://sumup-error)
  useEffect(() => {
    const handleDeepLink = (event: { url: string }) => {
      const url = event.url;
      if (!url) return;

      // beatus://sumup-connected → succès
      if (url.includes('sumup-connected')) {
        Alert.alert(
          'SumUp connecté !',
          'Votre compte SumUp a été connecté avec succès. Les devis et factures incluront désormais un lien de paiement.',
          [
            {
              text: 'Voir les paramètres',
              onPress: () => {
                if (navigationRef.isReady()) {
                  (navigationRef as any).navigate('SumUpSettings');
                }
              },
            },
            { text: 'OK' },
          ]
        );
      }

      // beatus://sumup-error → échec
      if (url.includes('sumup-error')) {
        const errorMatch = url.match(/error=([^&]+)/);
        const errorMessage = errorMatch
          ? decodeURIComponent(errorMatch[1])
          : 'Une erreur est survenue lors de la connexion SumUp.';
        Alert.alert('Erreur SumUp', errorMessage);
      }
    };

    // Écouter les deep links quand l'app est ouverte
    const linkSubscription = Linking.addEventListener('url', handleDeepLink);

    // Vérifier si l'app a été ouverte via un deep link
    Linking.getInitialURL().then((url) => {
      if (url) handleDeepLink({ url });
    });

    return () => linkSubscription.remove();
  }, []);

  // Vérifier si le profil est complet
  useEffect(() => {
    const checkProfileCompletion = async () => {
      if (!user) {
        setProfileComplete(null);
        return;
      }

      setCheckingProfile(true);
      try {
        const token = await SecureStore.getItemAsync('authToken');

        if (user.role === 'technician') {
          const response = await fetch(`${API_BASE_URL}/technicians/check-profile`, {
            headers: { 'Authorization': `Bearer ${token}` },
          });
          const data = await response.json();
          setProfileComplete(data.complete === true);
        } else if (user.role === 'team_leader') {
          const response = await fetch(`${API_BASE_URL}/team-leaders/check-profile`, {
            headers: { 'Authorization': `Bearer ${token}` },
          });
          
          if (response.ok) {
            const data = await response.json();
            setProfileComplete(data.complete === true);
          } else {
            // Fallback: si check-profile n'existe pas encore, utiliser /me
            const meResponse = await fetch(`${API_BASE_URL}/team-leaders/me`, {
              headers: { 'Authorization': `Bearer ${token}` },
            });
            if (meResponse.ok) {
              const meData = await meResponse.json();
              const tl = meData.data || meData;
              const name = tl.name ?? tl.user?.name ?? '';
              const email = tl.email ?? tl.user?.email ?? user?.email ?? '';
              // Profil complet si nom et email existent (phone optionnel)
              const isComplete = !!(name?.trim() && email?.trim());
              setProfileComplete(isComplete);
            } else {
              setProfileComplete(false);
            }
          }
        } else {
          setProfileComplete(true);
        }
      } catch (error) {
        console.error('Erreur vérification profil:', error);
        setProfileComplete(false);
      } finally {
        setCheckingProfile(false);
      }
    };

    checkProfileCompletion();
  }, [user]);

  const handleProfileComplete = () => {
    setProfileComplete(true);
  };

  if (isLoading || (user && checkingProfile)) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background }}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {user ? (
          profileComplete === false ? (
            <Stack.Screen name="ProfileCompletion">
              {(props) => <ProfileCompletionScreen {...props} onComplete={handleProfileComplete} />}
            </Stack.Screen>
          ) : user.role === 'team_leader' ? (
            <>
              <Stack.Screen name="TeamLeaderHome" component={TeamLeaderHomeScreen} />
              <Stack.Screen name="InviteTechnician" component={InviteTechnicianScreen} />
              <Stack.Screen name="InterventionDetail" component={InterventionDetailScreen} />
              <Stack.Screen name="DocumentSettings" component={DocumentSettingsScreen} />
              <Stack.Screen name="EmailSettings" component={EmailSettingsScreen} />
              <Stack.Screen name="TechnicianDefaults" component={TechnicianDefaultsScreen} />
              <Stack.Screen name="TechnicianEdit" component={TechnicianEditScreen} />
              <Stack.Screen name="CreateQuote" component={CreateQuoteScreen} />
              <Stack.Screen name="CreateInvoice" component={CreateInvoiceScreen} />
              <Stack.Screen name="MyDocuments" component={MyDocumentsScreen} />
              <Stack.Screen name="BillingSettings" component={BillingSettingsScreen} />
              <Stack.Screen name="SumUpSettings" component={SumUpSettingsScreen} />
              <Stack.Screen name="QuoteDetail" component={QuoteDetailScreen} />
              <Stack.Screen name="InvoiceDetail" component={InvoiceDetailScreen} />
              <Stack.Screen name="Messaging">
                {(props) => <MessagingScreen {...props} accentColor="#7c3aed" />}
              </Stack.Screen>
            </>
          ) : (
            <>
              <Stack.Screen name="TechnicianHome" component={TechnicianHomeScreen} />
              <Stack.Screen name="TechnicianSettings" component={TechnicianSettingsScreen} />
              <Stack.Screen name="InterventionDetail" component={InterventionDetailScreen} />
              <Stack.Screen name="CreateQuote" component={CreateQuoteScreen} />
              <Stack.Screen name="CreateInvoice" component={CreateInvoiceScreen} />
              <Stack.Screen name="MyDocuments" component={MyDocumentsScreen} />
              <Stack.Screen name="BillingSettings" component={BillingSettingsScreen} />
              <Stack.Screen name="SumUpSettings" component={SumUpSettingsScreen} />
              <Stack.Screen name="QuoteDetail" component={QuoteDetailScreen} />
              <Stack.Screen name="InvoiceDetail" component={InvoiceDetailScreen} />
              <Stack.Screen name="Messaging">
                {(props) => <MessagingScreen {...props} accentColor="#3b82f6" />}
              </Stack.Screen>
            </>
          )
        ) : (
          <Stack.Screen name="Welcome" component={WelcomeScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
