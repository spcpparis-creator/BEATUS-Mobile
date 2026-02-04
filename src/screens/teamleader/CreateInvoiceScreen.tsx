import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, API_BASE_URL } from '../../config/api';
import * as SecureStore from 'expo-secure-store';
import { generateAndSharePDF } from '../../utils/pdfGenerator';
import api from '../../services/api';

interface Props {
  navigation: any;
  route?: { params?: { interventionId?: string; intervention?: any; quoteId?: string; invoiceId?: string } };
}

interface LineItem {
  id: string;
  description: string;
  quantity: string;
  unitPrice: string;
}

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Brouillon' },
  { value: 'sent', label: 'Envoyée' },
  { value: 'paid', label: 'Payée' },
  { value: 'cancelled', label: 'Annulée' },
];

export default function CreateInvoiceScreen({ navigation, route }: Props) {
  const interventionId = route?.params?.interventionId;
  const intervention = route?.params?.intervention;
  const quoteId = route?.params?.quoteId;
  const existingInvoiceId = route?.params?.invoiceId;
  
  const [saving, setSaving] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [loading, setLoading] = useState(!!existingInvoiceId);
  
  // Informations client
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientAddress, setClientAddress] = useState('');
  
  // Articles
  const [items, setItems] = useState<LineItem[]>([]);
  const [showAddItem, setShowAddItem] = useState(false);
  const [newItemDescription, setNewItemDescription] = useState('');
  const [newItemQuantity, setNewItemQuantity] = useState('1');
  const [newItemPrice, setNewItemPrice] = useState('');
  
  // Montants
  const [amountTTC, setAmountTTC] = useState('');
  const [materialCost, setMaterialCost] = useState('');
  
  // Options
  const [status, setStatus] = useState('draft');
  const [notes, setNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [showStatusPicker, setShowStatusPicker] = useState(false);

  // Charger la facture existante si modification
  useEffect(() => {
    if (existingInvoiceId) {
      loadExistingInvoice();
    } else if (intervention) {
      prefillFromIntervention();
    }
  }, [existingInvoiceId, intervention]);

  const loadExistingInvoice = async () => {
    try {
      const invoice = await api.getInvoice(existingInvoiceId!);
      setClientName(invoice.clientName || '');
      setClientEmail(invoice.clientEmail || '');
      setClientPhone(invoice.clientPhone || '');
      setClientAddress(
        typeof invoice.clientAddress === 'string' 
          ? invoice.clientAddress 
          : invoice.clientAddress?.street || ''
      );
      setAmountTTC(String(invoice.amountTtc || invoice.amountTTC || ''));
      setMaterialCost(String(invoice.materialCost || ''));
      setStatus(invoice.status || 'draft');
      setNotes(invoice.notes || '');
      setPaymentMethod(invoice.paymentMethod || '');
      if (invoice.items && Array.isArray(invoice.items)) {
        setItems(invoice.items.map((item: any, idx: number) => ({
          id: String(idx),
          description: item.description || '',
          quantity: String(item.quantity || 1),
          unitPrice: String(item.unitPrice || 0),
        })));
      }
    } catch (error: any) {
      Alert.alert('Erreur', 'Impossible de charger la facture');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  };

  const prefillFromIntervention = () => {
    if (intervention?.client) {
      setClientName(intervention.client.name || '');
      setClientEmail(intervention.client.email || '');
      setClientPhone(intervention.client.phone || '');
      if (intervention.client.address) {
        const addr = intervention.client.address;
        setClientAddress(`${addr.street || ''}, ${addr.postalCode || ''} ${addr.city || ''}`.trim());
      }
    }
    if (intervention?.address && !clientAddress) {
      const addr = intervention.address;
      setClientAddress(`${addr.street || ''}, ${addr.postalCode || ''} ${addr.city || ''}`.trim());
    }
    const amount = intervention?.amountRealized || intervention?.amountTTC || intervention?.estimatedAmount;
    if (amount) {
      setAmountTTC(String(amount));
    }
  };

  const addItem = () => {
    if (!newItemDescription.trim() || !newItemPrice) {
      Alert.alert('Erreur', 'Veuillez remplir la description et le prix');
      return;
    }
    setItems([
      ...items,
      {
        id: Date.now().toString(),
        description: newItemDescription,
        quantity: newItemQuantity || '1',
        unitPrice: newItemPrice,
      }
    ]);
    setNewItemDescription('');
    setNewItemQuantity('1');
    setNewItemPrice('');
    setShowAddItem(false);
  };

  const removeItem = (id: string) => {
    setItems(items.filter(item => item.id !== id));
  };

  const calculateItemsTotal = () => {
    return items.reduce((sum, item) => {
      const qty = parseFloat(item.quantity) || 0;
      const price = parseFloat(item.unitPrice) || 0;
      return sum + (qty * price);
    }, 0);
  };

  const calculateTotal = () => {
    const itemsTotal = calculateItemsTotal();
    const ttc = parseFloat(amountTTC) || 0;
    const material = parseFloat(materialCost) || 0;
    return itemsTotal > 0 ? itemsTotal : ttc + material;
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount);
  };

  const buildInvoiceData = () => {
    const total = calculateTotal();
    const validItems = items.filter(item => 
      item.description.trim() && parseFloat(item.unitPrice) > 0
    );

    return {
      interventionId: interventionId || undefined,
      quoteId: quoteId || undefined,
      clientName,
      clientEmail,
      clientPhone,
      clientAddress: clientAddress ? { street: clientAddress } : undefined,
      items: validItems.length > 0 ? validItems.map(item => ({
        description: item.description,
        quantity: parseFloat(item.quantity) || 1,
        unitPrice: parseFloat(item.unitPrice) || 0,
      })) : undefined,
      amountTTC: total,
      amountTtc: total,
      materialCost: parseFloat(materialCost) || undefined,
      status,
      notes,
      paymentMethod: paymentMethod || undefined,
    };
  };

  const handleCreate = async () => {
    if (!clientName.trim()) {
      Alert.alert('Erreur', 'Le nom du client est obligatoire');
      return;
    }

    const total = calculateTotal();
    if (total <= 0) {
      Alert.alert('Erreur', 'Le montant doit être supérieur à 0');
      return;
    }

    setSaving(true);
    try {
      const token = await SecureStore.getItemAsync('authToken');
      const invoiceData = buildInvoiceData();

      const url = existingInvoiceId 
        ? `${API_BASE_URL}/invoices/${existingInvoiceId}`
        : `${API_BASE_URL}/invoices`;
      
      const response = await fetch(url, {
        method: existingInvoiceId ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(invoiceData),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || 'Erreur lors de la création');
      }

      const data = await response.json();
      Alert.alert(
        existingInvoiceId ? 'Facture modifiée !' : 'Facture créée !', 
        `Référence: ${data.reference || 'FAC-XXXX'}\nMontant: ${formatCurrency(total)}`,
        [
          { text: 'Voir mes documents', onPress: () => navigation.navigate('MyDocuments') },
          { text: 'OK', onPress: () => navigation.goBack() },
        ]
      );
    } catch (error: any) {
      Alert.alert('Erreur', error.message || 'Impossible de créer la facture');
    } finally {
      setSaving(false);
    }
  };

  const handleGeneratePDFAndSend = async () => {
    if (!clientName.trim()) {
      Alert.alert('Erreur', 'Le nom du client est obligatoire');
      return;
    }

    const total = calculateTotal();
    if (total <= 0) {
      Alert.alert('Erreur', 'Le montant doit être supérieur à 0');
      return;
    }

    setGeneratingPdf(true);
    try {
      // D'abord créer/sauvegarder la facture
      const token = await SecureStore.getItemAsync('authToken');
      const invoiceData = buildInvoiceData();

      const url = existingInvoiceId 
        ? `${API_BASE_URL}/invoices/${existingInvoiceId}`
        : `${API_BASE_URL}/invoices`;
      
      const response = await fetch(url, {
        method: existingInvoiceId ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(invoiceData),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || 'Erreur lors de la création');
      }

      const savedInvoice = await response.json();

      // Ensuite générer et partager le PDF
      let branding = {};
      try {
        branding = await api.getTenantSettings() || {};
      } catch (e) {
        console.log('Branding non disponible');
      }

      const pdfData = {
        ...savedInvoice,
        number: savedInvoice.reference,
        amountTTC: total,
        clientAddress: clientAddress,
        interventionReference: intervention?.reference || savedInvoice.interventionReference || savedInvoice.reference,
        paymentMethod,
        items: items.length > 0 ? items.map(item => ({
          description: item.description,
          quantity: parseFloat(item.quantity) || 1,
          unitPrice: parseFloat(item.unitPrice) || 0,
        })) : undefined,
      };

      await generateAndSharePDF(pdfData, 'invoice', branding);

      Alert.alert(
        'Facture créée et PDF généré !',
        'Le PDF a été généré. Vous pouvez maintenant l\'envoyer par email.',
        [
          { text: 'Voir mes documents', onPress: () => navigation.navigate('MyDocuments') },
          { text: 'OK', onPress: () => navigation.goBack() },
        ]
      );
    } catch (error: any) {
      Alert.alert('Erreur', error.message || 'Impossible de générer le PDF');
    } finally {
      setGeneratingPdf(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#22c55e" />
          <Text style={styles.loadingText}>Chargement...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const total = calculateTotal();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeButton}>
          <Text style={styles.closeButtonText}>✕</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.title}>
            {existingInvoiceId ? 'Modifier la facture' : 'Créer une facture'}
          </Text>
          {intervention && (
            <Text style={styles.subtitle}>
              Intervention {intervention.reference || interventionId?.substring(0, 8)}
            </Text>
          )}
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Informations client */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Informations client</Text>
          
          <View style={styles.row}>
            <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
              <Text style={styles.label}>Nom</Text>
              <TextInput
                style={styles.input}
                value={clientName}
                onChangeText={setClientName}
                placeholder="Nom du client"
              />
            </View>
            <View style={[styles.inputGroup, { flex: 1, marginLeft: 8 }]}>
              <Text style={styles.label}>Téléphone</Text>
              <TextInput
                style={styles.input}
                value={clientPhone}
                onChangeText={setClientPhone}
                placeholder="0612345678"
                keyboardType="phone-pad"
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              value={clientEmail}
              onChangeText={setClientEmail}
              placeholder="client@email.com"
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Adresse</Text>
            <TextInput
              style={styles.input}
              value={clientAddress}
              onChangeText={setClientAddress}
              placeholder="Adresse complète"
            />
          </View>
        </View>

        {/* Articles */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Articles</Text>
            <TouchableOpacity 
              style={styles.addManualButton}
              onPress={() => setShowAddItem(true)}
            >
              <Text style={styles.addManualButtonText}>+ Ajouter manuellement</Text>
            </TouchableOpacity>
          </View>

          {/* Liste des articles */}
          {items.map((item, index) => (
            <View key={item.id} style={styles.itemCard}>
              <View style={styles.itemContent}>
                <Text style={styles.itemDescription}>{item.description}</Text>
                <Text style={styles.itemDetails}>
                  {item.quantity} x {formatCurrency(parseFloat(item.unitPrice) || 0)}
                </Text>
              </View>
              <View style={styles.itemActions}>
                <Text style={styles.itemTotal}>
                  {formatCurrency((parseFloat(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0))}
                </Text>
                <TouchableOpacity onPress={() => removeItem(item.id)}>
                  <Text style={styles.removeItemButton}>✕</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}

          {items.length === 0 && (
            <View style={styles.emptyItems}>
              <Text style={styles.emptyItemsText}>Aucun article ajouté</Text>
              <Text style={styles.emptyItemsHint}>
                Utilisez le bouton ci-dessus ou remplissez le montant TTC
              </Text>
            </View>
          )}

          {/* Recherche article (placeholder) */}
          <View style={styles.searchContainer}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Rechercher un article existant..."
              editable={false}
            />
          </View>
        </View>

        {/* Montants */}
        <View style={styles.section}>
          <View style={styles.row}>
            <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
              <Text style={styles.label}>Montant TTC (€)</Text>
              <TextInput
                style={styles.input}
                value={amountTTC}
                onChangeText={setAmountTTC}
                placeholder="0.00"
                keyboardType="decimal-pad"
                editable={items.length === 0}
              />
            </View>
            <View style={[styles.inputGroup, { flex: 1, marginLeft: 8 }]}>
              <Text style={styles.label}>Coût matériel (€)</Text>
              <TextInput
                style={styles.input}
                value={materialCost}
                onChangeText={setMaterialCost}
                placeholder="0.00"
                keyboardType="decimal-pad"
              />
            </View>
          </View>
        </View>

        {/* Statut et Mode de paiement */}
        <View style={styles.section}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Statut</Text>
            <TouchableOpacity 
              style={styles.selectInput}
              onPress={() => setShowStatusPicker(true)}
            >
              <Text style={styles.selectInputText}>
                {STATUS_OPTIONS.find(s => s.value === status)?.label || 'Brouillon'}
              </Text>
              <Text style={styles.selectArrow}>▼</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Mode de paiement</Text>
            <TextInput
              style={styles.input}
              value={paymentMethod}
              onChangeText={setPaymentMethod}
              placeholder="Ex: Carte bancaire, Espèces, Virement..."
            />
          </View>
        </View>

        {/* Notes */}
        <View style={styles.section}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Notes</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Notes optionnelles..."
              multiline
              numberOfLines={4}
            />
          </View>
        </View>

        {/* Total affiché */}
        {total > 0 && (
          <View style={styles.totalBanner}>
            <Text style={styles.totalBannerLabel}>Total TTC</Text>
            <Text style={styles.totalBannerValue}>{formatCurrency(total)}</Text>
          </View>
        )}
      </ScrollView>

      {/* Boutons d'action */}
      <View style={styles.footer}>
        <TouchableOpacity 
          style={styles.cancelButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.cancelButtonText}>Annuler</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.pdfButton}
          onPress={handleGeneratePDFAndSend}
          disabled={generatingPdf || saving}
        >
          {generatingPdf ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Text style={styles.pdfButtonIcon}>📄</Text>
              <Text style={styles.pdfButtonText}>Générer PDF et envoyer</Text>
            </>
          )}
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.createButton}
          onPress={handleCreate}
          disabled={saving || generatingPdf}
        >
          {saving ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.createButtonText}>
              {existingInvoiceId ? 'Modifier' : 'Créer la facture'}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Modal ajout article */}
      <Modal
        visible={showAddItem}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAddItem(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Ajouter un article</Text>
              <TouchableOpacity onPress={() => setShowAddItem(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Description</Text>
              <TextInput
                style={styles.input}
                value={newItemDescription}
                onChangeText={setNewItemDescription}
                placeholder="Description de l'article"
              />
            </View>

            <View style={styles.row}>
              <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
                <Text style={styles.label}>Quantité</Text>
                <TextInput
                  style={styles.input}
                  value={newItemQuantity}
                  onChangeText={setNewItemQuantity}
                  placeholder="1"
                  keyboardType="numeric"
                />
              </View>
              <View style={[styles.inputGroup, { flex: 1, marginLeft: 8 }]}>
                <Text style={styles.label}>Prix unitaire (€)</Text>
                <TextInput
                  style={styles.input}
                  value={newItemPrice}
                  onChangeText={setNewItemPrice}
                  placeholder="0.00"
                  keyboardType="decimal-pad"
                />
              </View>
            </View>

            <TouchableOpacity style={styles.modalAddButton} onPress={addItem}>
              <Text style={styles.modalAddButtonText}>Ajouter</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal sélection statut */}
      <Modal
        visible={showStatusPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowStatusPicker(false)}
      >
        <TouchableOpacity 
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowStatusPicker(false)}
        >
          <View style={styles.pickerContent}>
            {STATUS_OPTIONS.map(option => (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.pickerOption,
                  status === option.value && styles.pickerOptionSelected
                ]}
                onPress={() => {
                  setStatus(option.value);
                  setShowStatusPicker(false);
                }}
              >
                <Text style={[
                  styles.pickerOptionText,
                  status === option.value && styles.pickerOptionTextSelected
                ]}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: COLORS.textMuted,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  closeButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 24,
    color: '#64748b',
  },
  headerCenter: {
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
  },
  subtitle: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 16,
  },
  addManualButton: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  addManualButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.text,
  },
  inputGroup: {
    marginBottom: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: COLORS.text,
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
  },
  selectInput: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  selectInputText: {
    fontSize: 15,
    color: COLORS.text,
  },
  selectArrow: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  itemCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f0fdf4',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  itemContent: {
    flex: 1,
  },
  itemDescription: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.text,
  },
  itemDetails: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  itemActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  itemTotal: {
    fontSize: 14,
    fontWeight: '600',
    color: '#16a34a',
  },
  removeItemButton: {
    fontSize: 18,
    color: '#ef4444',
    padding: 4,
  },
  emptyItems: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  emptyItemsText: {
    fontSize: 14,
    color: COLORS.textMuted,
  },
  emptyItemsHint: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 4,
    textAlign: 'center',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 12,
    marginTop: 8,
  },
  searchIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 14,
    color: COLORS.textMuted,
  },
  totalBanner: {
    backgroundColor: '#dcfce7',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  totalBannerLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#166534',
  },
  totalBannerValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#166534',
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    gap: 8,
    padding: 16,
    paddingBottom: 32,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  cancelButton: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  pdfButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: '#22c55e',
    gap: 6,
  },
  pdfButtonIcon: {
    fontSize: 16,
  },
  pdfButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
  createButton: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: '#3b82f6',
  },
  createButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 400,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
  },
  modalClose: {
    fontSize: 24,
    color: '#64748b',
  },
  modalAddButton: {
    backgroundColor: '#22c55e',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  modalAddButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  pickerContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 8,
    width: '80%',
    maxWidth: 300,
  },
  pickerOption: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  pickerOptionSelected: {
    backgroundColor: '#dcfce7',
  },
  pickerOptionText: {
    fontSize: 16,
    color: COLORS.text,
  },
  pickerOptionTextSelected: {
    color: '#166534',
    fontWeight: '600',
  },
});
