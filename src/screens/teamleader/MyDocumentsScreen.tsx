import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, API_BASE_URL } from '../../config/api';
import * as SecureStore from 'expo-secure-store';

interface Props {
  navigation: any;
}

interface Document {
  id: string;
  reference: string;
  type: 'quote' | 'invoice';
  status: string;
  clientName: string;
  amountHT: number;
  amountTTC: number;
  createdAt: string;
}

export default function MyDocumentsScreen({ navigation }: Props) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [activeTab, setActiveTab] = useState<'all' | 'quotes' | 'invoices'>('all');

  const loadDocuments = useCallback(async () => {
    try {
      const token = await SecureStore.getItemAsync('authToken');
      
      // Charger les devis
      const quotesResponse = await fetch(`${API_BASE_URL}/quotes/my`, {
        headers: { 'Authorization': `Bearer ${token}` },
      }).catch(() => ({ ok: false }));
      
      // Charger les factures
      const invoicesResponse = await fetch(`${API_BASE_URL}/invoices/my`, {
        headers: { 'Authorization': `Bearer ${token}` },
      }).catch(() => ({ ok: false }));

      const quotes = quotesResponse.ok 
        ? await (quotesResponse as Response).json().catch(() => []) 
        : [];
      const invoices = invoicesResponse.ok 
        ? await (invoicesResponse as Response).json().catch(() => []) 
        : [];

      // Combiner et trier par date
      const allDocs = [
        ...((Array.isArray(quotes) ? quotes : []).map((q: any) => ({ ...q, type: 'quote' as const }))),
        ...((Array.isArray(invoices) ? invoices : []).map((i: any) => ({ ...i, type: 'invoice' as const }))),
      ].sort((a, b) => 
        new Date(b.createdAt || b.created_at).getTime() - new Date(a.createdAt || a.created_at).getTime()
      );

      setDocuments(allDocs);
    } catch (error) {
      console.error('Erreur chargement documents:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadDocuments();
    setRefreshing(false);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      draft: 'Brouillon',
      sent: 'Envoyé',
      accepted: 'Accepté',
      rejected: 'Refusé',
      expired: 'Expiré',
      pending: 'En attente',
      paid: 'Payé',
      overdue: 'En retard',
    };
    return labels[status] || status;
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, { bg: string; text: string }> = {
      draft: { bg: '#f1f5f9', text: '#64748b' },
      sent: { bg: '#dbeafe', text: '#2563eb' },
      accepted: { bg: '#dcfce7', text: '#16a34a' },
      rejected: { bg: '#fee2e2', text: '#dc2626' },
      expired: { bg: '#fef3c7', text: '#b45309' },
      pending: { bg: '#fef3c7', text: '#b45309' },
      paid: { bg: '#dcfce7', text: '#16a34a' },
      overdue: { bg: '#fee2e2', text: '#dc2626' },
    };
    return colors[status] || { bg: '#f1f5f9', text: '#64748b' };
  };

  const filteredDocuments = documents.filter(doc => {
    if (activeTab === 'all') return true;
    if (activeTab === 'quotes') return doc.type === 'quote';
    if (activeTab === 'invoices') return doc.type === 'invoice';
    return true;
  });

  const quoteCount = documents.filter(d => d.type === 'quote').length;
  const invoiceCount = documents.filter(d => d.type === 'invoice').length;

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Retour</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Mes documents</Text>
        <Text style={styles.subtitle}>
          {quoteCount} devis • {invoiceCount} factures
        </Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'all' && styles.tabActive]}
          onPress={() => setActiveTab('all')}
        >
          <Text style={[styles.tabText, activeTab === 'all' && styles.tabTextActive]}>
            Tous ({documents.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'quotes' && styles.tabActive]}
          onPress={() => setActiveTab('quotes')}
        >
          <Text style={[styles.tabText, activeTab === 'quotes' && styles.tabTextActive]}>
            📝 Devis ({quoteCount})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'invoices' && styles.tabActive]}
          onPress={() => setActiveTab('invoices')}
        >
          <Text style={[styles.tabText, activeTab === 'invoices' && styles.tabTextActive]}>
            🧾 Factures ({invoiceCount})
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} />
        }
      >
        {filteredDocuments.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📄</Text>
            <Text style={styles.emptyTitle}>Aucun document</Text>
            <Text style={styles.emptySubtitle}>
              {activeTab === 'quotes' 
                ? 'Créez votre premier devis'
                : activeTab === 'invoices'
                ? 'Créez votre première facture'
                : 'Créez votre premier devis ou facture'
              }
            </Text>
            <View style={styles.emptyButtons}>
              <TouchableOpacity
                style={[styles.emptyButton, styles.quoteButton]}
                onPress={() => navigation.navigate('CreateQuote')}
              >
                <Text style={styles.emptyButtonText}>📝 Nouveau devis</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.emptyButton, styles.invoiceButton]}
                onPress={() => navigation.navigate('CreateInvoice')}
              >
                <Text style={styles.emptyButtonText}>🧾 Nouvelle facture</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          filteredDocuments.map((doc) => {
            const statusStyle = getStatusColor(doc.status);
            return (
              <TouchableOpacity
                key={`${doc.type}-${doc.id}`}
                style={styles.documentCard}
                onPress={() => Alert.alert(
                  doc.type === 'quote' ? 'Devis' : 'Facture',
                  `${doc.reference}\nClient: ${doc.clientName}\nMontant: ${formatCurrency(doc.amountTTC || doc.amountHT * 1.2)}`
                )}
              >
                <View style={styles.documentHeader}>
                  <View style={styles.documentTypeContainer}>
                    <Text style={styles.documentTypeIcon}>
                      {doc.type === 'quote' ? '📝' : '🧾'}
                    </Text>
                    <View>
                      <Text style={styles.documentReference}>{doc.reference}</Text>
                      <Text style={styles.documentType}>
                        {doc.type === 'quote' ? 'Devis' : 'Facture'}
                      </Text>
                    </View>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
                    <Text style={[styles.statusText, { color: statusStyle.text }]}>
                      {getStatusLabel(doc.status)}
                    </Text>
                  </View>
                </View>
                
                <View style={styles.documentBody}>
                  <Text style={styles.documentClient}>👤 {doc.clientName}</Text>
                  <Text style={styles.documentDate}>📅 {formatDate(doc.createdAt)}</Text>
                </View>

                <View style={styles.documentFooter}>
                  <Text style={styles.documentAmountLabel}>Montant TTC</Text>
                  <Text style={[
                    styles.documentAmount,
                    { color: doc.type === 'quote' ? '#b45309' : '#16a34a' }
                  ]}>
                    {formatCurrency(doc.amountTTC || doc.amountHT * 1.2)}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })
        )}

        {/* Boutons rapides */}
        {filteredDocuments.length > 0 && (
          <View style={styles.quickActions}>
            <TouchableOpacity
              style={[styles.quickButton, { backgroundColor: '#fef3c7' }]}
              onPress={() => navigation.navigate('CreateQuote')}
            >
              <Text style={styles.quickButtonIcon}>📝</Text>
              <Text style={[styles.quickButtonText, { color: '#b45309' }]}>Nouveau devis</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.quickButton, { backgroundColor: '#dcfce7' }]}
              onPress={() => navigation.navigate('CreateInvoice')}
            >
              <Text style={styles.quickButtonIcon}>🧾</Text>
              <Text style={[styles.quickButtonText, { color: '#16a34a' }]}>Nouvelle facture</Text>
            </TouchableOpacity>
          </View>
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
    backgroundColor: '#6366f1',
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
  subtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 4,
  },
  tabs: {
    flexDirection: 'row',
    padding: 16,
    gap: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: COLORS.card,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: '#6366f1',
  },
  tabText: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.textMuted,
  },
  tabTextActive: {
    color: '#fff',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingTop: 0,
    paddingBottom: 40,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginBottom: 24,
  },
  emptyButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  emptyButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
  },
  quoteButton: {
    backgroundColor: '#fef3c7',
  },
  invoiceButton: {
    backgroundColor: '#dcfce7',
  },
  emptyButtonText: {
    fontWeight: '600',
    fontSize: 14,
    color: COLORS.text,
  },
  documentCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  documentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  documentTypeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  documentTypeIcon: {
    fontSize: 28,
    marginRight: 12,
  },
  documentReference: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  documentType: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  documentBody: {
    flexDirection: 'row',
    gap: 16,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  documentClient: {
    fontSize: 14,
    color: COLORS.text,
  },
  documentDate: {
    fontSize: 14,
    color: COLORS.textMuted,
  },
  documentFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    marginTop: 8,
  },
  documentAmountLabel: {
    fontSize: 13,
    color: COLORS.textMuted,
  },
  documentAmount: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  quickActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  quickButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  quickButtonIcon: {
    fontSize: 18,
  },
  quickButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
