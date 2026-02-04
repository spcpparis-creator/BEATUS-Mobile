import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import { API_BASE_URL } from '../config/api';
import { registerAndSubscribe } from '../services/notificationService';

interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'team_leader' | 'technician' | 'client';
  tenantId?: string;
}

interface InvitationData {
  id: string;
  code: string;
  type: 'team_leader' | 'technician';
  tenantId: string;
  createdBy: string;
  creatorName: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (token: string, user: User) => Promise<void>;
  logout: () => Promise<void>;
  loginWithGoogle: (googleToken: string) => Promise<void>;
  loginWithGoogleAndInvitation: (googleToken: string, invitation: InvitationData) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadStoredAuth();
  }, []);

  const loadStoredAuth = async () => {
    try {
      const storedToken = await SecureStore.getItemAsync('authToken');
      const storedUser = await SecureStore.getItemAsync('authUser');
      
      if (storedToken && storedUser) {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
        
        // Vérifier que le token est toujours valide
        try {
          const response = await fetch(`${API_BASE_URL}/auth/me`, {
            headers: { Authorization: `Bearer ${storedToken}` },
          });
          if (response.ok) {
            const freshUser = await response.json();
            setUser(freshUser);
            await SecureStore.setItemAsync('authUser', JSON.stringify(freshUser));
            // Enregistrer les notifications push (techniciens et chefs d'équipe)
            if (freshUser.role === 'technician' || freshUser.role === 'team_leader') {
              registerAndSubscribe().catch(() => {});
            }
          } else {
            // Token invalide, déconnecter
            console.log('Token invalide, déconnexion...');
            await logout();
          }
        } catch (error) {
          console.error('Erreur vérification token:', error);
        }
      }
    } catch (error) {
      console.error('Erreur chargement auth:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (newToken: string, newUser: User) => {
    await SecureStore.setItemAsync('authToken', newToken);
    await SecureStore.setItemAsync('authUser', JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
    // Enregistrer les notifications push (techniciens et chefs d'équipe)
    if (newUser.role === 'technician' || newUser.role === 'team_leader') {
      registerAndSubscribe().catch(() => {});
    }
  };

  const logout = async () => {
    await SecureStore.deleteItemAsync('authToken');
    await SecureStore.deleteItemAsync('authUser');
    setToken(null);
    setUser(null);
  };

  // Connexion pour utilisateur existant
  const loginWithGoogle = async (googleToken: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: googleToken }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erreur de connexion');
      }

      // Vérifier que l'utilisateur est technicien ou team_leader
      if (data.user.role !== 'technician' && data.user.role !== 'team_leader') {
        throw new Error('Cette application est réservée aux techniciens et chefs d\'équipe. Utilisez l\'application web pour les autres rôles.');
      }

      await login(data.token, data.user);
    } catch (error: any) {
      console.error('Erreur connexion Google:', error);
      throw error;
    }
  };

  // Connexion avec code d'invitation (nouvel utilisateur)
  const loginWithGoogleAndInvitation = async (googleToken: string, invitation: InvitationData) => {
    try {
      // 1. Authentifier avec Google en passant le rôle et le tenantId
      const response = await fetch(`${API_BASE_URL}/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: googleToken,
          role: invitation.type,
          tenantId: invitation.tenantId,
          invitationCode: invitation.code,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erreur de connexion');
      }

      // 2. Marquer l'invitation comme utilisée
      try {
        await fetch(`${API_BASE_URL}/invitations/use`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${data.token}`,
          },
          body: JSON.stringify({ code: invitation.code }),
        });
      } catch (useError) {
        console.error('Erreur marquage invitation:', useError);
        // Continuer même si ça échoue
      }

      await login(data.token, data.user);
    } catch (error: any) {
      console.error('Erreur connexion avec invitation:', error);
      throw error;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        login,
        logout,
        loginWithGoogle,
        loginWithGoogleAndInvitation,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth doit être utilisé dans un AuthProvider');
  }
  return context;
}
