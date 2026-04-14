// Service API pour l'application mobile BEATUS
import * as SecureStore from 'expo-secure-store';
import { API_BASE_URL } from '../config/api';
import { logErrorDetailed } from '../utils/errorLogger';

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
      const errMsg = error.error || error.message || 'Erreur serveur';
      logErrorDetailed({
        file: 'src/services/api.ts',
        line: 28,
        function: 'request',
        code: 'if (!response.ok) { throw ... }',
        message: `${options.method || 'GET'} ${endpoint} → ${response.status} ${response.statusText}`,
        context: {
          endpoint: `${this.baseUrl}${endpoint}`,
          method: options.method || 'GET',
          status: response.status,
          statusText: response.statusText,
          responseBody: error,
        },
      });
      throw new Error(errMsg);
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

  async declineIntervention(id: string, reason?: string) {
    return this.request<any>(`/interventions/${id}/decline`, {
      method: 'POST',
      body: JSON.stringify(reason ? { reason } : {}),
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

  async assignInterventionToTech(interventionId: string, technicianId: string) {
    return this.request<any>(`/interventions/${interventionId}`, {
      method: 'PATCH',
      body: JSON.stringify({ technicianId, status: 'pending' }),
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

  async updateMyProfile(data: { name?: string; phone?: string }) {
    return this.request<any>('/technicians/profile', {
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

  // Team Leaders - normalise snake_case → camelCase (valeurs configurées par l'admin)
  // Les paramètres (secteurs, activités, commission, billingType) doivent venir du backend (copiés depuis l'invitation)
  async getTeamLeaderMe() {
    const raw = await this.request<any>('/team-leaders/me');
    const data = raw?.data ?? raw?.teamLeader ?? raw;
    if (!data) return raw;
    const inv = data.invitation ?? data.invitationConfig ?? data.invitation_config ?? {};
    const normalized = {
      ...data,
      id: data.id,
      userId: data.userId ?? data.user_id,
      name: data.name,
      email: data.email,
      phone: data.phone,
      commissionFromAdmin: data.commissionFromAdmin ?? data.commission_from_admin ?? inv.commissionFromAdmin ?? inv.commission_from_admin,
      defaultTechnicianCommission: data.defaultTechnicianCommission ?? data.default_technician_commission ?? inv.defaultTechnicianCommission,
      billingType: data.billingType ?? data.billing_type ?? inv.billingType ?? inv.billing_type,
      selectedDepartments: data.selectedDepartments ?? data.selected_departments ?? inv.selectedDepartments ?? inv.selected_departments ?? [],
      activityIds: data.activityIds ?? data.activity_ids ?? inv.activityIds ?? inv.activity_ids ?? [],
      activities: data.activities ?? inv.activities ?? [],
    };
    return { ...raw, data: normalized };
  }

  async updateTeamLeader(id: string, data: any) {
    return this.request<any>(`/team-leaders/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async updateMyTLProfile(data: { name?: string; phone?: string }) {
    return this.request<any>('/team-leaders/me', {
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
    activityIds?: string[];
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
    const headers = await this.getHeaders();
    const response = await fetch(`${this.baseUrl}/user-templates`, { headers });
    if (response.status === 403) return [];
    if (!response.ok) throw new Error('Erreur chargement templates');
    return response.json();
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

  // ========== STRIPE CONNECT ==========

  async createStripeCheckout(data: {
    amount: number;
    quoteId?: string;
    quoteReference?: string;
    clientName?: string;
    description?: string;
  }) {
    return this.request<{ checkoutUrl: string; checkoutId: string; amount: number }>('/stripe-connect/create-checkout', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // ========== EMAIL ==========

  async sendQuoteWithPdf(data: {
    to: string;
    subject: string;
    message: string;
    pdfBase64: string;
    quoteId?: string;
  }) {
    return this.request<{ success: boolean; messageId?: string }>('/email/send-quote-with-pdf', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async sendInvoiceById(invoiceId: string) {
    return this.request<{ success: boolean; messageId?: string }>(`/email/send-invoice/${invoiceId}`, {
      method: 'POST',
    });
  }

  // ========== SUMUP ==========

  /** Vérifie les permissions SumUp de l'utilisateur courant */
  async getSumUpPermission() {
    return this.request<{
      allowed: boolean;
      reason: string | null;
      billingType: string | null;
      role: string;
    }>('/sumup/permission', { method: 'GET' });
  }

  /** Statut de connexion SumUp + droits */
  async getSumUpStatus() {
    return this.request<{
      connected: boolean;
      merchantId: string | null;
      merchantCode: string | null;
      connectedAt: string | null;
      canManage: boolean;
      permissionReason: string | null;
    }>('/sumup/status', { method: 'GET' });
  }

  /** Retourne l'URL OAuth SumUp pour ouvrir dans le navigateur */
  async getSumUpConnectUrl() {
    return this.request<{ url: string }>('/sumup/connect-url', { method: 'GET' });
  }

  /** Déconnecte le compte SumUp du tenant */
  async disconnectSumUp() {
    return this.request<{ message: string }>('/sumup/disconnect', { method: 'POST' });
  }

  /** Crée un checkout SumUp (lien de paiement) */
  async createSumUpCheckout(data: {
    amount: number;
    currency?: string;
    description?: string;
    purpose: 'deposit' | 'balance';
    referenceId?: string;
    referenceType?: 'quote' | 'invoice';
  }) {
    return this.request<{
      checkoutId: string;
      checkoutUrl: string;
      checkoutReference: string;
      amount: number;
      status: string;
    }>('/sumup/checkout', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /** Vérifie le statut d'un checkout SumUp (PENDING, PAID, FAILED) */
  async getSumUpCheckoutStatus(checkoutId: string) {
    return this.request<{
      checkoutId: string;
      status: string;
      isPaid: boolean;
      amount: number;
      transactionId: string | null;
    }>(`/sumup/checkout/${checkoutId}/status`, { method: 'GET' });
  }

  /** Récupère le nombre total de messages non lus */
  async getUnreadMessagesCount(): Promise<number> {
    try {
      const conversations = await this.request<any[]>('/messaging/conversations', { method: 'GET' });
      if (Array.isArray(conversations)) {
        return conversations.reduce((sum, c) => sum + (c.unread_count || 0), 0);
      }
      return 0;
    } catch {
      return 0;
    }
  }
}

export const api = new ApiService();
export default api;
