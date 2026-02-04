import React, { useState, useEffect, useRef } from 'react';
import { NavigationContainer, useNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useAuth } from '../contexts/AuthContext';
import { COLORS, API_BASE_URL } from '../config/api';
import * as SecureStore from 'expo-secure-store';

// Screens
import WelcomeScreen from '../screens/WelcomeScreen';
import ProfileCompletionScreen from '../screens/ProfileCompletionScreen';
import TechnicianHomeScreen from '../screens/technician/TechnicianHomeScreen';
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

export type RootStackParamList = {
  Welcome: undefined;
  ProfileCompletion: undefined;
  TechnicianHome: undefined;
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
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function AppNavigator() {
  const { user, isLoading } = useAuth();
  const [profileComplete, setProfileComplete] = useState<boolean | null>(null);
  const [checkingProfile, setCheckingProfile] = useState(false);
  const navigationRef = useNavigationContainerRef<RootStackParamList>();

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
          const response = await fetch(`${API_BASE_URL}/team-leaders/me`, {
            headers: { 'Authorization': `Bearer ${token}` },
          });
          
          if (response.ok) {
            const data = await response.json();
            const teamLeader = data.data || data;
            const isComplete = teamLeader.selectedDepartments?.length > 0 && teamLeader.billingType;
            setProfileComplete(isComplete);
          } else {
            setProfileComplete(false);
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
          // Utilisateur connecté
          profileComplete === false ? (
            // Profil incomplet - afficher l'écran de complétion
            <Stack.Screen name="ProfileCompletion">
              {(props) => <ProfileCompletionScreen {...props} onComplete={handleProfileComplete} />}
            </Stack.Screen>
          ) : user.role === 'team_leader' ? (
            // Team Leader avec profil complet
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
              <Stack.Screen name="QuoteDetail" component={QuoteDetailScreen} />
              <Stack.Screen name="InvoiceDetail" component={InvoiceDetailScreen} />
            </>
          ) : (
            // Technicien avec profil complet
            <>
              <Stack.Screen name="TechnicianHome" component={TechnicianHomeScreen} />
              <Stack.Screen name="InterventionDetail" component={InterventionDetailScreen} />
              <Stack.Screen name="CreateQuote" component={CreateQuoteScreen} />
              <Stack.Screen name="CreateInvoice" component={CreateInvoiceScreen} />
              <Stack.Screen name="MyDocuments" component={MyDocumentsScreen} />
              <Stack.Screen name="QuoteDetail" component={QuoteDetailScreen} />
              <Stack.Screen name="InvoiceDetail" component={InvoiceDetailScreen} />
            </>
          )
        ) : (
          // Utilisateur non connecté - Page d'accueil
          <Stack.Screen name="Welcome" component={WelcomeScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
