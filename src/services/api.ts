// Service API pour l'application mobile BEATUS
import * as SecureStore from 'expo-secure-store';
import { API_BASE_URL } from '../config/api';

class ApiService {
  private baseUrl = API_BASE_URL;

  private async getHeaders(): Promise<HeadersInit> {
    const token = await SecureStore.getItemAsync('authToken');
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const headers = await this.getHeaders();
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: { ...headers, ...options.headers },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || error.message || 'Erreur serveur');
    }

    return response.json();
  }

  // Auth
  async loginWithGoogle(token: string) {
    return this.request<{ token: string; user: any }>('/auth/google', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
  }

  async getMe() {
    return this.request<any>('/auth/me');
  }

  // Interventions
  async getInterventions(params?: Record<string, string | string[]>) {
    let queryString = '';
    if (params) {
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (Array.isArray(value)) {
          value.forEach(v => searchParams.append(key, v));
        } else {
          searchParams.append(key, value);
        }
      });
      queryString = '?' + searchParams.toString();
    }
    return this.request<any[]>(`/interventions${queryString}`);
  }

  async getIntervention(id: string) {
    return this.request<any>(`/interventions/${id}`);
  }

  async acceptIntervention(id: string, location?: { lat: number; lng: number }) {
    return this.request<any>(`/interventions/${id}/accept`, {
      method: 'POST',
      body: JSON.stringify(location ? { location } : {}),
    });
  }

  async cancelIntervention(id: string, reason?: string) {
    return this.request<any>(`/interventions/${id}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  }

  async completeIntervention(id: string, data: any) {
    return this.request<any>(`/interventions/${id}/complete`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateInterventionStatus(id: string, status: string) {
    return this.request<any>(`/interventions/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  }

  // Techniciens
  async getTechnicians() {
    return this.request<any[]>('/technicians');
  }

  async getTechnician(id: string) {
    return this.request<any>(`/technicians/${id}`);
  }

  async checkTechnicianProfile() {
    return this.request<{ exists: boolean; complete: boolean; technician?: any }>(
      '/technicians/check-profile'
    );
  }

  async getTechnicianProfile() {
    const result = await this.request<{ exists: boolean; complete: boolean; technician?: any }>(
      '/technicians/check-profile'
    );
    return result?.technician || null;
  }

  async updateTechnician(id: string, data: any) {
    return this.request<any>(`/technicians/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async updateLocation(lat: number, lng: number) {
    return this.request<any>('/technicians/location', {
      method: 'POST',
      body: JSON.stringify({ lat, lng }),
    });
  }

  async toggleAvailability(available: boolean) {
    return this.request<any>('/technicians/availability', {
      method: 'PATCH',
      body: JSON.stringify({ available }),
    });
  }

  // Team Leaders
  async getTeamLeaderMe() {
    return this.request<any>('/team-leaders/me');
  }

  async updateTeamLeader(id: string, data: any) {
    return this.request<any>(`/team-leaders/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async getTeamLeaderTechnicians(teamLeaderId?: string) {
    if (teamLeaderId) {
      return this.request<any[]>(`/team-leaders/${teamLeaderId}/technicians`);
    }
    // Utiliser l'endpoint /me/technicians pour le TL connecté
    return this.request<any[]>('/team-leaders/me/technicians');
  }

  async getTeamLeaderStats(teamLeaderId?: string) {
    if (teamLeaderId) {
      return this.request<any>(`/team-leaders/${teamLeaderId}/stats`);
    }
    return this.request<any>('/team-leaders/stats');
  }

  async updateTechnicianCommission(teamLeaderId: string, technicianId: string, commission: number) {
    return this.request<any>(`/team-leaders/${teamLeaderId}/technicians/${technicianId}/commission`, {
      method: 'PATCH',
      body: JSON.stringify({ commission }),
    });
  }

  // Mettre à jour les détails d'un technicien (par le team leader)
  async updateTechnicianByTeamLeader(teamLeaderId: string, technicianId: string, data: {
    selectedDepartments?: string[];
    specialties?: string[];
    commissionPercentage?: number;
    name?: string;
    phone?: string;
  }) {
    return this.request<any>(`/team-leaders/${teamLeaderId}/technicians/${technicianId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  // Sector Assignments
  async getSectorAssignments() {
    return this.request<any[]>('/sector-assignments');
  }

  async selfAssignSector(sectorCode: string) {
    return this.request<any>('/sector-assignments/self-assign', {
      method: 'POST',
      body: JSON.stringify({ sectorCode }),
    });
  }

  async assignSectorToTechnician(sectorCode: string, technicianUserId: string) {
    return this.request<any>('/sector-assignments/assign', {
      method: 'POST',
      body: JSON.stringify({ sectorCode, technicianUserId }),
    });
  }

  async deleteSectorAssignment(assignmentId: string) {
    return this.request<any>(`/sector-assignments/${assignmentId}`, {
      method: 'DELETE',
    });
  }

  // Invitations
  async generateInvitation(data: {
    type: 'team_leader' | 'technician';
    email?: string;
    sectorCode?: string;
    billingType?: 'spcp' | 'self';
    commissionPercentage?: number;
  }) {
    return this.request<{ invitation: { code: string } }>('/invitations/generate', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async validateInvitation(code: string) {
    return this.request<any>('/invitations/validate', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
  }

  // User Templates (pour auto-facturation)
  async getUserTemplates() {
    return this.request<any[]>('/user-templates');
  }

  async saveUserTemplate(templateType: string, content: string, variables?: Record<string, any>) {
    return this.request<any>('/user-templates', {
      method: 'POST',
      body: JSON.stringify({ templateType, content, variables }),
    });
  }

  // Activities (spécialités du tenant)
  async getActivities() {
    const result = await this.request<{ activities: any[] }>('/activities');
    return result.activities || [];
  }

  // Notifications
  async getNotifications() {
    return this.request<any[]>('/notifications');
  }

  async markNotificationRead(id: string) {
    return this.request<any>(`/notifications/${id}/read`, {
      method: 'PATCH',
    });
  }

  async subscribeToNotifications(subscription: any) {
    return this.request<any>('/notifications/subscribe', {
      method: 'POST',
      body: JSON.stringify(subscription),
    });
  }

  // ========== BILLING SETTINGS ==========
  
  async getBillingSettings() {
    return this.request<{
      settings: any;
      canCustomize: boolean;
      entityId?: string;
      entityType?: string;
      message?: string;
    }>('/billing-settings/me');
  }

  async saveBillingSettings(data: any) {
    return this.request<{ success: boolean; settings: any }>('/billing-settings', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async uploadLogo(base64Data: string, filename: string) {
    return this.request<{ success: boolean; logoUrl: string }>('/billing-settings/upload-logo', {
      method: 'POST',
      body: JSON.stringify({ base64Data, filename }),
    });
  }

  async deleteLogo() {
    return this.request<{ success: boolean }>('/billing-settings/logo', {
      method: 'DELETE',
    });
  }

  // ========== QUOTES (DEVIS) ==========

  async getQuotes(params?: { status?: string; interventionId?: string }) {
    let queryString = '';
    if (params) {
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value) searchParams.append(key, value);
      });
      queryString = `?${searchParams.toString()}`;
    }
    return this.request<any[]>(`/quotes${queryString}`);
  }

  async getQuote(id: string) {
    return this.request<any>(`/quotes/${id}`);
  }

  async createQuote(data: {
    interventionId?: string;
    clientId?: string;
    clientName?: string;
    clientEmail?: string;
    clientPhone?: string;
    clientAddress?: any;
    items: Array<{ description: string; quantity: number; unitPrice: number }>;
    description?: string;
    notes?: string;
    tvaRate?: number;
    validUntil?: string;
  }) {
    return this.request<any>('/quotes', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateQuote(id: string, data: any) {
    return this.request<any>(`/quotes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async sendQuote(id: string) {
    return this.request<{ success: boolean; quote: any }>(`/quotes/${id}/send`, {
      method: 'POST',
    });
  }

  async acceptQuote(id: string, signatureUrl?: string) {
    return this.request<{ success: boolean; quote: any }>(`/quotes/${id}/accept`, {
      method: 'POST',
      body: JSON.stringify({ signatureUrl }),
    });
  }

  async rejectQuote(id: string, reason?: string) {
    return this.request<{ success: boolean; quote: any }>(`/quotes/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  }

  async deleteQuote(id: string) {
    return this.request<{ success: boolean }>(`/quotes/${id}`, {
      method: 'DELETE',
    });
  }

  // ========== INVOICES (FACTURES) ==========

  async getInvoices(params?: { status?: string; interventionId?: string }) {
    let queryString = '';
    if (params) {
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value) searchParams.append(key, value);
      });
      queryString = `?${searchParams.toString()}`;
    }
    return this.request<any[]>(`/invoices${queryString}`);
  }

  async getInvoice(id: string) {
    return this.request<any>(`/invoices/${id}`);
  }

  async createInvoice(data: {
    interventionId?: string;
    quoteId?: string;
    clientId?: string;
    clientName?: string;
    clientEmail?: string;
    clientPhone?: string;
    clientAddress?: any;
    items: Array<{ description: string; quantity: number; unitPrice: number }>;
    description?: string;
    notes?: string;
    tvaRate?: number;
    dueDate?: string;
  }) {
    return this.request<any>('/invoices', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateInvoice(id: string, data: any) {
    return this.request<any>(`/invoices/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async sendInvoice(id: string) {
    return this.request<{ success: boolean; invoice: any }>(`/invoices/${id}/send`, {
      method: 'POST',
    });
  }

  async markInvoicePaid(id: string, data?: { amountPaid?: number; paymentMethod?: string; paymentReference?: string }) {
    return this.request<{ success: boolean; invoice: any }>(`/invoices/${id}/pay`, {
      method: 'POST',
      body: JSON.stringify(data || {}),
    });
  }

  async deleteInvoice(id: string) {
    return this.request<{ success: boolean }>(`/invoices/${id}`, {
      method: 'DELETE',
    });
  }

  // Paramètres du tenant (branding, logo, etc.)
  async getTenantSettings() {
    return this.request<any>('/tenant/settings', {
      method: 'GET',
    });
  }
}

export const api = new ApiService();
export default api;
