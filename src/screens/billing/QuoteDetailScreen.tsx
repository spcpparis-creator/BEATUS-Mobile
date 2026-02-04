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
  route: { params: { quoteId: string } };
  navigation: any;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  draft: { label: 'Brouillon', color: '#6b7280', bg: '#f3f4f6' },
  sent: { label: 'Envoyé', color: '#0369a1', bg: '#e0f2fe' },
  viewed: { label: 'Consulté', color: '#7c3aed', bg: '#ede9fe' },
  accepted: { label: 'Accepté', color: '#059669', bg: '#d1fae5' },
  rejected: { label: 'Refusé', color: '#dc2626', bg: '#fee2e2' },
  expired: { label: 'Expiré', color: '#9ca3af', bg: '#f3f4f6' },
  converted: { label: 'Converti', color: '#059669', bg: '#d1fae5' },
};

export default function QuoteDetailScreen({ route, navigation }: Props) {
  const { quoteId } = route.params;
  const [quote, setQuote] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    loadQuote();
  }, [quoteId]);

  const loadQuote = async () => {
    try {
      const data = await api.getQuote(quoteId);
      setQuote(data);
    } catch (error: any) {
      Alert.alert('Erreur', error.message || 'Impossible de charger le devis');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async () => {
    Alert.alert(
      'Envoyer le devis',
      `Envoyer le devis à ${quote.clientEmail || 'l\'adresse email du client'} ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Envoyer',
          onPress: async () => {
            setActionLoading('send');
            try {
              await api.sendQuote(quoteId);
              Alert.alert('Succès', 'Devis envoyé avec succès');
              loadQuote();
            } catch (error: any) {
              Alert.alert('Erreur', error.message || 'Impossible d\'envoyer le devis');
            } finally {
              setActionLoading(null);
            }
          },
        },
      ]
    );
  };

  const handleAccept = async () => {
    setActionLoading('accept');
    try {
      await api.acceptQuote(quoteId);
      Alert.alert('Succès', 'Devis accepté');
      loadQuote();
    } catch (error: any) {
      Alert.alert('Erreur', error.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async () => {
    Alert.prompt(
      'Refuser le devis',
      'Raison du refus (optionnel)',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Refuser',
          style: 'destructive',
          onPress: async (reason) => {
            setActionLoading('reject');
            try {
              await api.rejectQuote(quoteId, reason);
              Alert.alert('Devis refusé');
              loadQuote();
            } catch (error: any) {
              Alert.alert('Erreur', error.message);
            } finally {
              setActionLoading(null);
            }
          },
        },
      ],
      'plain-text'
    );
  };

  const handleConvertToInvoice = () => {
    navigation.navigate('CreateInvoice', {
      quoteId: quote.id,
      interventionId: quote.interventionId,
    });
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Devis ${quote.reference}\nMontant: ${formatCurrency(quote.amountTtc)}\nValide jusqu'au: ${formatDate(quote.validUntil)}`,
        title: `Devis ${quote.reference}`,
      });
    } catch (error) {
      console.error('Share error:', error);
    }
  };

  const handleGeneratePDF = async () => {
    setActionLoading('pdf');
    try {
      // Préparer les données du devis pour le PDF
      const quoteData = {
        ...quote,
        number: quote.reference,
        amountTTC: quote.amountTtc,
        interventionReference: quote.interventionReference || quote.reference,
        clientAddress: quote.clientAddress?.street || quote.clientAddress,
      };
      
      // Récupérer les paramètres de branding si disponibles
      let branding = {};
      try {
        const tenantSettings = await api.getTenantSettings();
        branding = tenantSettings || {};
      } catch (e) {
        console.log('Branding non disponible, utilisation des valeurs par défaut');
      }
      
      await generateAndSharePDF(quoteData, 'quote', branding);
    } catch (error: any) {
      Alert.alert('Erreur', error.message || 'Impossible de générer le PDF');
    } finally {
      setActionLoading(null);
    }
  };

  const handlePrintPDF = async () => {
    setActionLoading('print');
    try {
      const quoteData = {
        ...quote,
        number: quote.reference,
        amountTTC: quote.amountTtc,
        interventionReference: quote.interventionReference || quote.reference,
        clientAddress: quote.clientAddress?.street || quote.clientAddress,
      };
      
      let branding = {};
      try {
        const tenantSettings = await api.getTenantSettings();
        branding = tenantSettings || {};
      } catch (e) {
        console.log('Branding non disponible');
      }
      
      await printPDF(quoteData, 'quote', branding);
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

  const status = STATUS_CONFIG[quote?.status] || STATUS_CONFIG.draft;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Retour</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Devis</Text>
        <TouchableOpacity onPress={handleShare} style={styles.shareButton}>
          <Text style={styles.shareButtonText}>📤</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Header info */}
        <View style={styles.quoteHeader}>
          <View>
            <Text style={styles.reference}>{quote?.reference}</Text>
            <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
              <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
            </View>
          </View>
          <Text style={styles.totalAmount}>{formatCurrency(quote?.amountTtc)}</Text>
        </View>

        {/* Client info */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Client</Text>
          <Text style={styles.clientName}>{quote?.clientName || 'Non spécifié'}</Text>
          {quote?.clientEmail && <Text style={styles.clientInfo}>📧 {quote.clientEmail}</Text>}
          {quote?.clientPhone && <Text style={styles.clientInfo}>📞 {quote.clientPhone}</Text>}
          {quote?.clientAddress?.street && (
            <Text style={styles.clientInfo}>📍 {quote.clientAddress.street}</Text>
          )}
        </View>

        {/* Dates */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Dates</Text>
          <View style={styles.dateRow}>
            <Text style={styles.dateLabel}>Créé le</Text>
            <Text style={styles.dateValue}>{formatDate(quote?.createdAt)}</Text>
          </View>
          <View style={styles.dateRow}>
            <Text style={styles.dateLabel}>Valide jusqu'au</Text>
            <Text style={styles.dateValue}>{formatDate(quote?.validUntil)}</Text>
          </View>
          {quote?.sentAt && (
            <View style={styles.dateRow}>
              <Text style={styles.dateLabel}>Envoyé le</Text>
              <Text style={styles.dateValue}>{formatDate(quote.sentAt)}</Text>
            </View>
          )}
          {quote?.acceptedAt && (
            <View style={styles.dateRow}>
              <Text style={styles.dateLabel}>Accepté le</Text>
              <Text style={[styles.dateValue, { color: COLORS.success }]}>{formatDate(quote.acceptedAt)}</Text>
            </View>
          )}
        </View>

        {/* Items */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Articles</Text>
          {(quote?.items || []).map((item: any, index: number) => (
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
              <Text style={styles.totalValue}>{formatCurrency(quote?.amountHt)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>TVA ({quote?.tvaRate || 20}%)</Text>
              <Text style={styles.totalValue}>{formatCurrency(quote?.tvaAmount)}</Text>
            </View>
            <View style={[styles.totalRow, styles.totalFinal]}>
              <Text style={styles.totalLabelFinal}>Total TTC</Text>
              <Text style={styles.totalValueFinal}>{formatCurrency(quote?.amountTtc)}</Text>
            </View>
          </View>
        </View>

        {/* Notes */}
        {quote?.notes && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Notes</Text>
            <Text style={styles.notesText}>{quote.notes}</Text>
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
                <ActivityIndicator color={COLORS.primary} size="small" />
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
        {quote?.status === 'draft' && (
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={[styles.actionButton, styles.editButton]}
              onPress={() => navigation.navigate('CreateQuote', { quoteId: quote.id })}
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

        {quote?.status === 'sent' && (
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={[styles.actionButton, styles.rejectButton]}
              onPress={handleReject}
              disabled={actionLoading !== null}
            >
              <Text style={styles.rejectButtonText}>✕ Refuser</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, styles.acceptButton]}
              onPress={handleAccept}
              disabled={actionLoading !== null}
            >
              {actionLoading === 'accept' ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.acceptButtonText}>✓ Accepter</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {quote?.status === 'accepted' && (
          <TouchableOpacity
            style={[styles.actionButton, styles.convertButton]}
            onPress={handleConvertToInvoice}
          >
            <Text style={styles.convertButtonText}>🧾 Convertir en facture</Text>
          </TouchableOpacity>
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
    backgroundColor: '#0ea5e9',
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
  quoteHeader: {
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
  totalAmount: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.primary,
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
    color: COLORS.success,
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
    backgroundColor: '#0ea5e9',
  },
  sendButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 15,
  },
  rejectButton: {
    backgroundColor: '#fee2e2',
  },
  rejectButtonText: {
    color: '#dc2626',
    fontWeight: '600',
    fontSize: 15,
  },
  acceptButton: {
    backgroundColor: COLORS.success,
  },
  acceptButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 15,
  },
  convertButton: {
    backgroundColor: '#22c55e',
  },
  convertButtonText: {
    color: '#fff',
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
    backgroundColor: COLORS.primary,
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
