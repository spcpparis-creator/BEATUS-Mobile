// Configuration API pour l'application mobile BEATUS
// Utilise le même backend que l'application web
export const API_BASE_URL = 'https://beatus-backend.deno.dev/api';

// Google OAuth Client ID - Utiliser le Client ID Web pour Expo Go
// Pour Expo Go, on doit utiliser un Client ID de type "Web application"
export const GOOGLE_CLIENT_ID = '954969751630-hi31ugd2qu1dvp9eil8ccd3kqnf07tum.apps.googleusercontent.com';

// Couleurs de l'application (cohérentes avec le web)
export const COLORS = {
  primary: '#3b82f6',      // blue-500
  primaryDark: '#2563eb',  // blue-600
  secondary: '#64748b',    // slate-500
  success: '#22c55e',      // green-500
  warning: '#f59e0b',      // amber-500
  danger: '#ef4444',       // red-500
  background: '#f8fafc',   // slate-50
  card: '#ffffff',
  text: '#1e293b',         // slate-800
  textMuted: '#64748b',    // slate-500
  border: '#e2e8f0',       // slate-200
};

// Status des interventions
export const STATUS_COLORS: Record<string, string> = {
  pending: '#f59e0b',      // amber
  assigned: '#3b82f6',     // blue
  accepted: '#8b5cf6',     // violet
  in_progress: '#06b6d4',  // cyan
  completed: '#22c55e',    // green
  cancelled: '#ef4444',    // red
  invoiced: '#10b981',     // emerald
};

export const STATUS_LABELS: Record<string, string> = {
  pending: 'En attente',
  assigned: 'Assignée',
  accepted: 'Acceptée',
  in_progress: 'En cours',
  completed: 'Terminée',
  cancelled: 'Annulée',
  invoiced: 'Facturée',
};

export const TYPE_LABELS: Record<string, string> = {
  repair: 'Réparation',
  maintenance: 'Maintenance',
  installation: 'Installation',
  inspection: 'Inspection',
  emergency: 'Urgence',
};

export default API_BASE_URL;
