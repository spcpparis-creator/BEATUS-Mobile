import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import api from '../../services/api';
import { COLORS } from '../../config/api';
import { generateAndSharePDF, printPDF } from '../../utils/pdfGenerator';

interface Props {
  route: { params: { invoiceId: string } };
  navigation: any;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  draft: { label: 'Brouillon', color: '#6b7280', bg: '#f3f4f6' },
  sent: { label: 'Envoyée', color: '#0369a1', bg: '#e0f2fe' },
  viewed: { label: 'Consultée', color: '#7c3aed', bg: '#ede9fe' },
  partially_paid: { label: 'Partiellement payée', color: '#ea580c', bg: '#ffedd5' },
  paid: { label: 'Payée', color: '#059669', bg: '#d1fae5' },
  overdue: { label: 'En retard', color: '#dc2626', bg: '#fee2e2' },
  cancelled: { label: 'Annulée', color: '#9ca3af', bg: '#f3f4f6' },
  refunded: { label: 'Remboursée', color: '#7c3aed', bg: '#ede9fe' },
};

export default function InvoiceDetailScreen({ route, navigation }: Props) {
  const { invoiceId } = route.params;
  const [invoice, setInvoice] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    loadInvoice();
  }, [invoiceId]);

  const loadInvoice = async () => {
    try {
      const data = await api.getInvoice(invoiceId);
      setInvoice(data);
    } catch (error: any) {
      Alert.alert('Erreur', error.message || 'Impossible de charger la facture');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async () => {
    Alert.alert(
      'Envoyer la facture',
      `Envoyer la facture à ${invoice.clientEmail || 'l\'adresse email du client'} ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Envoyer',
          onPress: async () => {
            setActionLoading('send');
            try {
              await api.sendInvoice(invoiceId);
              Alert.alert('Succès', 'Facture envoyée avec succès');
              loadInvoice();
            } catch (error: any) {
              Alert.alert('Erreur', error.message || 'Impossible d\'envoyer la facture');
            } finally {
              setActionLoading(null);
            }
          },
        },
      ]
    );
  };

  const handleMarkPaid = async () => {
    Alert.alert(
      'Marquer comme payée',
      'Confirmer que cette facture a été payée ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Confirmer',
          onPress: async () => {
            setActionLoading('pay');
            try {
              await api.markInvoicePaid(invoiceId, {
                amountPaid: invoice.amountTtc,
                paymentMethod: 'manual',
              });
              Alert.alert('Succès', 'Facture marquée comme payée');
              loadInvoice();
            } catch (error: any) {
              Alert.alert('Erreur', error.message);
            } finally {
              setActionLoading(null);
            }
          },
        },
      ]
    );
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Facture ${invoice.reference}\nMontant: ${formatCurrency(invoice.amountTtc)}\nÉchéance: ${formatDate(invoice.dueDate)}`,
        title: `Facture ${invoice.reference}`,
      });
    } catch (error) {
      console.error('Share error:', error);
    }
  };

  const handleGeneratePDF = async () => {
    setActionLoading('pdf');
    try {
      // Préparer les données de la facture pour le PDF
      const invoiceData = {
        ...invoice,
        number: invoice.reference,
        amountTTC: invoice.amountTtc,
        interventionReference: invoice.interventionReference || invoice.reference,
        clientAddress: invoice.clientAddress?.street || invoice.clientAddress,
      };
      
      // Récupérer les paramètres de branding si disponibles
      let branding = {};
      try {
        const tenantSettings = await api.getTenantSettings();
        branding = tenantSettings || {};
      } catch (e) {
        console.log('Branding non disponible, utilisation des valeurs par défaut');
      }
      
      await generateAndSharePDF(invoiceData, 'invoice', branding);
    } catch (error: any) {
      Alert.alert('Erreur', error.message || 'Impossible de générer le PDF');
    } finally {
      setActionLoading(null);
    }
  };

  const handlePrintPDF = async () => {
    setActionLoading('print');
    try {
      const invoiceData = {
        ...invoice,
        number: invoice.reference,
        amountTTC: invoice.amountTtc,
        interventionReference: invoice.interventionReference || invoice.reference,
        clientAddress: invoice.clientAddress?.street || invoice.clientAddress,
      };
      
      let branding = {};
      try {
        const tenantSettings = await api.getTenantSettings();
        branding = tenantSettings || {};
      } catch (e) {
        console.log('Branding non disponible');
      }
      
      await printPDF(invoiceData, 'invoice', branding);
    } catch (error: any) {
      Alert.alert('Erreur', error.message || 'Impossible d\'imprimer le PDF');
    } finally {
      setActionLoading(null);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount || 0);
  };

  const formatDate = (date: string) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const status = STATUS_CONFIG[invoice?.status] || STATUS_CONFIG.draft;
  const isOverdue = invoice?.dueDate && new Date(invoice.dueDate) < new Date() && invoice.status !== 'paid';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Retour</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Facture</Text>
        <TouchableOpacity onPress={handleShare} style={styles.shareButton}>
          <Text style={styles.shareButtonText}>📤</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Header info */}
        <View style={styles.invoiceHeader}>
          <View>
            <Text style={styles.reference}>{invoice?.reference}</Text>
            <View style={[styles.statusBadge, { backgroundColor: isOverdue ? '#fee2e2' : status.bg }]}>
              <Text style={[styles.statusText, { color: isOverdue ? '#dc2626' : status.color }]}>
                {isOverdue ? '⚠️ En retard' : status.label}
              </Text>
            </View>
          </View>
          <View style={styles.amountContainer}>
            <Text style={styles.totalAmount}>{formatCurrency(invoice?.amountTtc)}</Text>
            {invoice?.amountPaid > 0 && invoice?.amountPaid < invoice?.amountTtc && (
              <Text style={styles.paidAmount}>Payé: {formatCurrency(invoice.amountPaid)}</Text>
            )}
          </View>
        </View>

        {/* Issuer info */}
        {invoice?.issuerCompanyName && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Émetteur</Text>
            <Text style={styles.issuerName}>{invoice.issuerCompanyName}</Text>
            {invoice.issuerSiret && <Text style={styles.issuerInfo}>SIRET: {invoice.issuerSiret}</Text>}
            {invoice.issuerTvaNumber && <Text style={styles.issuerInfo}>TVA: {invoice.issuerTvaNumber}</Text>}
            {invoice.issuerAddress && (
              <Text style={styles.issuerInfo}>
                {invoice.issuerAddress}, {invoice.issuerPostalCode} {invoice.issuerCity}
              </Text>
            )}
          </View>
        )}

        {/* Client info */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Client</Text>
          <Text style={styles.clientName}>{invoice?.clientName || 'Non spécifié'}</Text>
          {invoice?.clientEmail && <Text style={styles.clientInfo}>📧 {invoice.clientEmail}</Text>}
          {invoice?.clientPhone && <Text style={styles.clientInfo}>📞 {invoice.clientPhone}</Text>}
          {invoice?.clientAddress?.street && (
            <Text style={styles.clientInfo}>📍 {invoice.clientAddress.street}</Text>
          )}
        </View>

        {/* Dates */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Dates</Text>
          <View style={styles.dateRow}>
            <Text style={styles.dateLabel}>Date d'émission</Text>
            <Text style={styles.dateValue}>{formatDate(invoice?.issueDate)}</Text>
          </View>
          <View style={styles.dateRow}>
            <Text style={styles.dateLabel}>Date d'échéance</Text>
            <Text style={[styles.dateValue, isOverdue && { color: '#dc2626', fontWeight: '600' }]}>
              {formatDate(invoice?.dueDate)}
            </Text>
          </View>
          {invoice?.sentAt && (
            <View style={styles.dateRow}>
              <Text style={styles.dateLabel}>Envoyée le</Text>
              <Text style={styles.dateValue}>{formatDate(invoice.sentAt)}</Text>
            </View>
          )}
          {invoice?.paidAt && (
            <View style={styles.dateRow}>
              <Text style={styles.dateLabel}>Payée le</Text>
              <Text style={[styles.dateValue, { color: COLORS.success }]}>{formatDate(invoice.paidAt)}</Text>
            </View>
          )}
        </View>

        {/* Items */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Articles</Text>
          {(invoice?.items || []).map((item: any, index: number) => (
            <View key={index} style={styles.itemRow}>
              <View style={styles.itemInfo}>
                <Text style={styles.itemDescription}>{item.description}</Text>
                <Text style={styles.itemQty}>{item.quantity} x {formatCurrency(item.unitPrice)}</Text>
              </View>
              <Text style={styles.itemTotal}>{formatCurrency(item.quantity * item.unitPrice)}</Text>
            </View>
          ))}

          <View style={styles.totalsSection}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total HT</Text>
              <Text style={styles.totalValue}>{formatCurrency(invoice?.amountHt)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>TVA ({invoice?.tvaRate || 20}%)</Text>
              <Text style={styles.totalValue}>{formatCurrency(invoice?.tvaAmount)}</Text>
            </View>
            <View style={[styles.totalRow, styles.totalFinal]}>
              <Text style={styles.totalLabelFinal}>Total TTC</Text>
              <Text style={styles.totalValueFinal}>{formatCurrency(invoice?.amountTtc)}</Text>
            </View>
          </View>
        </View>

        {/* Payment info */}
        {invoice?.issuerIban && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Coordonnées bancaires</Text>
            <View style={styles.bankInfo}>
              <Text style={styles.bankLabel}>IBAN</Text>
              <Text style={styles.bankValue}>{invoice.issuerIban}</Text>
            </View>
            {invoice.issuerBic && (
              <View style={styles.bankInfo}>
                <Text style={styles.bankLabel}>BIC</Text>
                <Text style={styles.bankValue}>{invoice.issuerBic}</Text>
              </View>
            )}
          </View>
        )}

        {/* Notes */}
        {invoice?.notes && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Notes</Text>
            <Text style={styles.notesText}>{invoice.notes}</Text>
          </View>
        )}

        {/* Actions PDF */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Document PDF</Text>
          <View style={styles.pdfActionsRow}>
            <TouchableOpacity
              style={[styles.pdfButton, styles.pdfShareButton]}
              onPress={handleGeneratePDF}
              disabled={actionLoading !== null}
            >
              {actionLoading === 'pdf' ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Text style={styles.pdfButtonIcon}>📄</Text>
                  <Text style={styles.pdfShareButtonText}>Télécharger PDF</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.pdfButton, styles.pdfPrintButton]}
              onPress={handlePrintPDF}
              disabled={actionLoading !== null}
            >
              {actionLoading === 'print' ? (
                <ActivityIndicator color="#22c55e" size="small" />
              ) : (
                <>
                  <Text style={styles.pdfButtonIcon}>🖨️</Text>
                  <Text style={styles.pdfPrintButtonText}>Imprimer</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Actions */}
      <View style={styles.actionsContainer}>
        {invoice?.status === 'draft' && (
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={[styles.actionButton, styles.editButton]}
              onPress={() => navigation.navigate('CreateInvoice', { invoiceId: invoice.id })}
            >
              <Text style={styles.editButtonText}>✏️ Modifier</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, styles.sendButton]}
              onPress={handleSend}
              disabled={actionLoading !== null}
            >
              {actionLoading === 'send' ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.sendButtonText}>📧 Envoyer</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {(invoice?.status === 'sent' || invoice?.status === 'viewed' || invoice?.status === 'partially_paid') && (
          <TouchableOpacity
            style={[styles.actionButton, styles.paidButton]}
            onPress={handleMarkPaid}
            disabled={actionLoading !== null}
          >
            {actionLoading === 'pay' ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.paidButtonText}>💰 Marquer comme payée</Text>
            )}
          </TouchableOpacity>
        )}

        {invoice?.status === 'paid' && (
          <View style={styles.paidBanner}>
            <Text style={styles.paidBannerText}>✓ Facture payée le {formatDate(invoice.paidAt)}</Text>
          </View>
        )}
      </View>
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#22c55e',
  },
  backButton: {
    padding: 4,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  shareButton: {
    padding: 4,
  },
  shareButtonText: {
    fontSize: 20,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 20,
  },
  invoiceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  reference: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 8,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    alignSelf: 'flex-start',
  },
  statusText: {
    fontSize: 13,
    fontWeight: '600',
  },
  amountContainer: {
    alignItems: 'flex-end',
  },
  totalAmount: {
    fontSize: 24,
    fontWeight: '700',
    color: '#22c55e',
  },
  paidAmount: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginTop: 4,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textMuted,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  issuerName: {
    fontSize: 17,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8,
  },
  issuerInfo: {
    fontSize: 14,
    color: COLORS.textMuted,
    marginBottom: 4,
  },
  clientName: {
    fontSize: 17,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8,
  },
  clientInfo: {
    fontSize: 14,
    color: COLORS.textMuted,
    marginBottom: 4,
  },
  dateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  dateLabel: {
    fontSize: 14,
    color: COLORS.textMuted,
  },
  dateValue: {
    fontSize: 14,
    color: COLORS.text,
    fontWeight: '500',
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  itemInfo: {
    flex: 1,
  },
  itemDescription: {
    fontSize: 15,
    color: COLORS.text,
    marginBottom: 2,
  },
  itemQty: {
    fontSize: 13,
    color: COLORS.textMuted,
  },
  itemTotal: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
  },
  totalsSection: {
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  totalLabel: {
    fontSize: 14,
    color: COLORS.textMuted,
  },
  totalValue: {
    fontSize: 14,
    color: COLORS.text,
  },
  totalFinal: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  totalLabelFinal: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  totalValueFinal: {
    fontSize: 18,
    fontWeight: '700',
    color: '#22c55e',
  },
  bankInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  bankLabel: {
    fontSize: 14,
    color: COLORS.textMuted,
  },
  bankValue: {
    fontSize: 14,
    color: COLORS.text,
    fontWeight: '500',
    fontFamily: 'monospace',
  },
  notesText: {
    fontSize: 14,
    color: COLORS.text,
    lineHeight: 22,
  },
  actionsContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.card,
    padding: 20,
    paddingBottom: 32,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editButton: {
    backgroundColor: '#f3f4f6',
  },
  editButtonText: {
    color: COLORS.text,
    fontWeight: '600',
    fontSize: 15,
  },
  sendButton: {
    backgroundColor: '#22c55e',
  },
  sendButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 15,
  },
  paidButton: {
    backgroundColor: '#22c55e',
  },
  paidButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 15,
  },
  paidBanner: {
    backgroundColor: '#d1fae5',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  paidBannerText: {
    color: '#059669',
    fontWeight: '600',
    fontSize: 15,
  },
  pdfActionsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  pdfButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    gap: 8,
  },
  pdfShareButton: {
    backgroundColor: '#22c55e',
  },
  pdfPrintButton: {
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  pdfButtonIcon: {
    fontSize: 18,
  },
  pdfShareButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  pdfPrintButtonText: {
    color: COLORS.text,
    fontWeight: '600',
    fontSize: 14,
  },
});
