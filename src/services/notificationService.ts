// Service de notifications push pour BEATUS Mobile
// Notifications natives iOS et Android (écran verrouillé supporté)
//
// Format attendu du backend lors de l'envoi via Expo Push API :
// POST https://exp.host/--/api/v2/push/send
// {
//   "to": "ExponentPushToken[xxx]",
//   "title": "Nouvelle intervention",
//   "body": "Une intervention vous a été assignée",
//   "data": { "interventionId": "xxx" }
// }
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import api from './api';

// Comportement des notifications (foreground)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldAnimate: true,
  }),
});

/**
 * Configure le canal de notifications Android (priorité max pour écran verrouillé)
 */
async function setupAndroidChannel() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Interventions',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#3b82f6',
      sound: 'default',
    });
  }
}

/**
 * Enregistre l'appareil pour les notifications push et envoie le token au backend
 * Retourne le token ou null si échec
 */
export async function registerForPushNotifications(): Promise<string | null> {
  // Uniquement sur appareil physique
  if (!Device.isDevice) {
    console.warn('Les notifications push nécessitent un appareil physique');
    return null;
  }

  await setupAndroidChannel();

  // Vérifier les permissions
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.warn('Permission de notification refusée');
    return null;
  }

  // Récupérer le projectId (requis pour Expo Push Token)
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) {
    console.warn('projectId non trouvé - exécutez "eas init" et configurez EAS');
    return null;
  }

  try {
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId,
    });
    const expoPushToken = tokenData.data;
    return expoPushToken;
  } catch (error) {
    console.error('Erreur récupération token push:', error);
    return null;
  }
}

/**
 * Enregistre le token push auprès du backend BEATUS
 */
export async function subscribeToBackend(expoPushToken: string): Promise<boolean> {
  try {
    await api.subscribeToNotifications({ expoPushToken });
    return true;
  } catch (error) {
    console.error('Erreur enregistrement token backend:', error);
    return false;
  }
}

/**
 * Enregistrement complet : permissions + token + envoi au backend
 */
export async function registerAndSubscribe(): Promise<boolean> {
  const token = await registerForPushNotifications();
  if (!token) return false;
  return subscribeToBackend(token);
}
