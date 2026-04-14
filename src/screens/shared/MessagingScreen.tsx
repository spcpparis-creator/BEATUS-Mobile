import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Image,
  Alert,
  Modal,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from '../../contexts/AuthContext';

let Audio: any = null;
try { Audio = require('expo-av').Audio; } catch { /* expo-av pas disponible dans ce build */ }
import { API_BASE_URL, COLORS } from '../../config/api';

interface Conversation {
  id: string;
  type: string;
  title: string | null;
  last_message_at: string;
  last_message_preview: string | null;
  unread_count: number;
  participants: { userId: string; userRole: string; userName: string }[];
}

interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_name: string;
  sender_role: string;
  content: string;
  message_type: string;
  attachments: any[];
  created_at: string;
}

function formatTime(dateStr: string) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return "À l'instant";
  if (diffMins < 60) return `${diffMins}min`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}j`;
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function formatFullTime(dateStr: string) {
  return new Date(dateStr).toLocaleString('fr-FR', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

function getRoleEmoji(role: string) {
  switch (role) {
    case 'admin': return '👤';
    case 'technician': return '🔧';
    case 'client': return '🏢';
    case 'team_leader': return '👑';
    default: return '👤';
  }
}

function getRoleLabel(role: string) {
  switch (role) {
    case 'admin': return 'Admin';
    case 'technician': return 'Technicien';
    case 'client': return 'Client';
    case 'team_leader': return 'Chef';
    default: return role;
  }
}

interface Props {
  navigation: any;
  route?: { params?: { conversationId?: string; interventionId?: string; interventionRef?: string } };
  accentColor?: string;
}

export default function MessagingScreen({ navigation, route, accentColor = '#2563eb' }: Props) {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedConv, setSelectedConv] = useState<string | null>(null);
  const [messageInput, setMessageInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [initDone, setInitDone] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // Audio recording
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Audio playback
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const [audioProgress, setAudioProgress] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const soundRef = useRef<Audio.Sound | null>(null);

  // Emoji picker
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  // Si on arrive avec un interventionId, trouver ou créer la conversation
  useEffect(() => {
    if (initDone) return;
    const params = route?.params;
    if (params?.conversationId) {
      setSelectedConv(params.conversationId);
      setInitDone(true);
    } else if (params?.interventionId) {
      findOrCreateInterventionConv(params.interventionId, params.interventionRef);
    } else {
      setInitDone(true);
    }
  }, [route?.params]);

  const findOrCreateInterventionConv = async (interventionId: string, interventionRef?: string) => {
    try {
      const headers = await getHeaders();
      // Chercher une conversation existante pour cette intervention
      const res = await fetch(`${API_BASE_URL}/messaging/intervention/${interventionId}`, { headers });
      if (res.ok) {
        const data = await res.json();
        if (data && data.id) {
          setSelectedConv(data.id);
          setInitDone(true);
          return;
        }
      }
      // Pas de conversation existante, en créer une
      const createRes = await fetch(`${API_BASE_URL}/messaging/conversations`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          type: 'intervention',
          title: interventionRef ? `🔧 ${interventionRef}` : '🔧 Intervention',
          interventionId,
          participantIds: [],
          participantNames: [],
          participantRoles: [],
        }),
      });
      if (createRes.ok) {
        const conv = await createRes.json();
        setSelectedConv(conv.id);
      } else {
        Alert.alert('Erreur', 'Impossible de créer la conversation');
      }
    } catch (err) {
      console.log('[Messaging] Erreur findOrCreate intervention conv:', err);
      Alert.alert('Erreur', 'Impossible de charger la conversation');
    } finally {
      setInitDone(true);
    }
  };

  const getHeaders = async () => {
    const token = await SecureStore.getItemAsync('authToken');
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  };

  // Charger les conversations
  const loadConversations = useCallback(async () => {
    try {
      const headers = await getHeaders();
      const res = await fetch(`${API_BASE_URL}/messaging/conversations`, { headers });
      if (res.ok) {
        const data = await res.json();
        // Trier par dernier message (plus récent en premier)
        data.sort((a: any, b: any) => {
          const dateA = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
          const dateB = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
          return dateB - dateA;
        });
        setConversations(data);
      }
    } catch (err) {
      console.log('[Messaging] Erreur chargement conversations:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Charger les messages d'une conversation
  const loadMessages = useCallback(async (convId: string) => {
    try {
      setLoadingMessages(true);
      const headers = await getHeaders();
      const res = await fetch(`${API_BASE_URL}/messaging/conversations/${convId}/messages`, { headers });
      if (res.ok) {
        const data = await res.json();
        setMessages(data);
      }
      // Marquer comme lu
      await fetch(`${API_BASE_URL}/messaging/conversations/${convId}/read`, {
        method: 'POST',
        headers,
      });
    } catch (err) {
      console.log('[Messaging] Erreur chargement messages:', err);
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  // Polling
  useEffect(() => {
    loadConversations();
    pollingRef.current = setInterval(() => {
      if (selectedConv) {
        loadMessages(selectedConv);
      }
      loadConversations();
    }, 5000);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [selectedConv]);

  useEffect(() => {
    if (selectedConv) {
      loadMessages(selectedConv);
    }
  }, [selectedConv]);

  // Envoyer un message
  const handleSend = async () => {
    if (!messageInput.trim() || !selectedConv || sending) return;
    setSending(true);
    try {
      const headers = await getHeaders();
      const res = await fetch(`${API_BASE_URL}/messaging/conversations/${selectedConv}/messages`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ content: messageInput.trim() }),
      });
      if (res.ok) {
        setMessageInput('');
        await loadMessages(selectedConv);
        await loadConversations();
      }
    } catch (err) {
      Alert.alert('Erreur', "Impossible d'envoyer le message");
    } finally {
      setSending(false);
    }
  };

  // Envoyer une image
  const handlePickImage = async () => {
    if (!selectedConv) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      try {
        const token = await SecureStore.getItemAsync('authToken');
        const formData = new FormData();
        const asset = result.assets[0];
        formData.append('file', {
          uri: asset.uri,
          type: asset.mimeType || 'image/jpeg',
          name: asset.fileName || 'photo.jpg',
        } as any);
        formData.append('conversationId', selectedConv);

        const res = await fetch(`${API_BASE_URL}/messaging/upload`, {
          method: 'POST',
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: formData,
        });

        if (res.ok) {
          const data = await res.json();
          // Envoyer le message avec l'image
          const headers = await getHeaders();
          await fetch(`${API_BASE_URL}/messaging/conversations/${selectedConv}/messages`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              content: '',
              messageType: 'image',
              attachments: [{ url: data.url, fileName: data.fileName, fileType: data.fileType }],
            }),
          });
          await loadMessages(selectedConv);
          await loadConversations();
        }
      } catch (err) {
        Alert.alert('Erreur', "Impossible d'envoyer l'image");
      }
    }
  };

  const isAudioAvailable = !!Audio;

  // ===== ENREGISTREMENT AUDIO =====
  const startRecording = async () => {
    if (!Audio) { Alert.alert('Non disponible', 'Les messages vocaux nécessitent une mise à jour de l\'app.'); return; }
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) { Alert.alert('Permission refusée', "L'accès au micro est nécessaire"); return; }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      recordingRef.current = recording;
      setIsRecording(true);
      setRecordingDuration(0);
      recordingTimerRef.current = setInterval(() => setRecordingDuration(d => d + 1), 1000);
    } catch {
      Alert.alert('Erreur', "Impossible de démarrer l'enregistrement");
    }
  };

  const stopAndSendRecording = async () => {
    if (!recordingRef.current || !selectedConv) return;
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    setIsRecording(false);
    setRecordingDuration(0);
    try {
      await recordingRef.current.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;
      if (!uri) return;

      setSending(true);
      const token = await SecureStore.getItemAsync('authToken');
      const formData = new FormData();
      formData.append('file', { uri, type: 'audio/m4a', name: `vocal-${Date.now()}.m4a` } as any);
      formData.append('conversationId', selectedConv);

      const uploadRes = await fetch(`${API_BASE_URL}/messaging/upload`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      if (uploadRes.ok) {
        const data = await uploadRes.json();
        const headers = await getHeaders();
        await fetch(`${API_BASE_URL}/messaging/conversations/${selectedConv}/messages`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ content: '', messageType: 'audio', attachments: [{ url: data.url, fileName: data.fileName, fileType: data.fileType }] }),
        });
        await loadMessages(selectedConv);
        await loadConversations();
      }
    } catch {
      Alert.alert('Erreur', "Impossible d'envoyer le message vocal");
    } finally {
      setSending(false);
    }
  };

  const cancelRecording = async () => {
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    setIsRecording(false);
    setRecordingDuration(0);
    if (recordingRef.current) {
      try { await recordingRef.current.stopAndUnloadAsync(); } catch {}
      if (Audio) await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      recordingRef.current = null;
    }
  };

  // ===== LECTURE AUDIO =====
  const playAudio = async (msgId: string, url: string) => {
    if (!Audio) { Alert.alert('Non disponible', 'La lecture audio nécessite une mise à jour de l\'app.'); return; }
    try {
      if (soundRef.current) { await soundRef.current.unloadAsync(); soundRef.current = null; }
      if (playingAudioId === msgId) { setPlayingAudioId(null); return; }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
      const { sound } = await Audio.Sound.createAsync({ uri: url }, { shouldPlay: true }, (status) => {
        if (status.isLoaded) {
          setAudioProgress(status.positionMillis || 0);
          setAudioDuration(status.durationMillis || 0);
          if (status.didJustFinish) { setPlayingAudioId(null); setAudioProgress(0); }
        }
      });
      soundRef.current = sound;
      setPlayingAudioId(msgId);
    } catch {
      Alert.alert('Erreur', 'Impossible de lire cet audio');
    }
  };

  useEffect(() => { return () => { soundRef.current?.unloadAsync(); }; }, []);

  const fmtTime = (s: number) => { const m = Math.floor(s / 60); const sec = s % 60; return `${m}:${sec.toString().padStart(2, '0')}`; };
  const fmtMs = (ms: number) => fmtTime(Math.floor(ms / 1000));

  // ===== EMOJIS =====
  const EMOJI_LIST = ['😀','😂','🤣','😊','😍','😘','😎','🤩','😇','🙏','👍','👋','❤️','🔥','✅','👏','💪','🎉','✨','👌','✌️','🤝','👊','🫡','📱','🔧','📞','📋','💰','🏠','⚠️','❗','💡','🔔','⭐','💯'];

  const getDisplayName = (conv: Conversation) => {
    if (conv.title) return conv.title;
    const other = conv.participants?.find(p => p.userId !== user?.id);
    return other?.userName || 'Conversation';
  };

  // Titre pour une conversation d'intervention quand on vient du détail
  const interventionTitle = route?.params?.interventionRef
    ? `🔧 ${route.params.interventionRef}`
    : null;

  const selectedConvData = conversations.find(c => c.id === selectedConv);

  // ===== VUE LISTE DES CONVERSATIONS =====
  if (!selectedConv) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: accentColor }]} edges={['top']}>
        {/* Header */}
        <View style={[styles.header, { backgroundColor: accentColor }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Text style={styles.backText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>💬 Messages</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.listContainer}>
          {loading ? (
            <View style={styles.centerContainer}>
              <ActivityIndicator size="large" color={accentColor} />
              <Text style={styles.loadingText}>Chargement...</Text>
            </View>
          ) : conversations.length === 0 ? (
            <View style={styles.centerContainer}>
              <Text style={{ fontSize: 48 }}>💬</Text>
              <Text style={styles.emptyTitle}>Aucun message</Text>
              <Text style={styles.emptySubtitle}>Vos conversations apparaîtront ici</Text>
            </View>
          ) : (
            <FlatList
              data={conversations}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => {
                const other = item.participants?.find(p => p.userId !== user?.id);
                return (
                  <TouchableOpacity
                    style={styles.convItem}
                    onPress={() => setSelectedConv(item.id)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.avatar, { backgroundColor: accentColor + '20' }]}>
                      <Text style={{ fontSize: 20 }}>{getRoleEmoji(other?.userRole || 'admin')}</Text>
                    </View>
                    <View style={styles.convInfo}>
                      <View style={styles.convTopRow}>
                        <Text style={[styles.convName, item.unread_count > 0 && styles.convNameBold]} numberOfLines={1}>
                          {getDisplayName(item)}
                        </Text>
                        <Text style={styles.convTime}>
                          {item.last_message_at && formatTime(item.last_message_at)}
                        </Text>
                      </View>
                      <View style={styles.convBottomRow}>
                        <Text
                          style={[styles.convPreview, item.unread_count > 0 && styles.convPreviewBold]}
                          numberOfLines={1}
                        >
                          {item.last_message_preview || 'Aucun message'}
                        </Text>
                        {item.unread_count > 0 && (
                          <View style={[styles.unreadBadge, { backgroundColor: accentColor }]}>
                            <Text style={styles.unreadText}>
                              {item.unread_count > 99 ? '99+' : item.unread_count}
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              }}
            />
          )}
        </View>
      </SafeAreaView>
    );
  }

  // ===== VUE CHAT =====
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: '#f9fafb' }]} edges={['top']}>
      {/* Header Chat */}
      <View style={[styles.chatHeader, { backgroundColor: accentColor }]}>
        <TouchableOpacity onPress={() => {
          // Si on vient d'une intervention, retourner à l'écran précédent
          if (route?.params?.interventionId) {
            navigation.goBack();
          } else {
            setSelectedConv(null);
          }
        }} style={styles.backButton}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        {selectedConvData ? (() => {
          const other = selectedConvData.participants?.find(p => p.userId !== user?.id);
          const interventionId = selectedConvData.intervention_id || route?.params?.interventionId;
          const isIntervention = selectedConvData.type === 'intervention' && interventionId;
          const headerContent = (
            <View style={styles.chatHeaderInfo}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={[styles.chatHeaderName, isIntervention && { textDecorationLine: 'underline' }]} numberOfLines={1}>
                  {getDisplayName(selectedConvData)}
                </Text>
                {isIntervention && <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14 }}>↗</Text>}
              </View>
              <Text style={styles.chatHeaderRole}>
                {isIntervention ? 'Appuyer pour voir l\'intervention' : getRoleLabel(other?.userRole || '')}
              </Text>
            </View>
          );
          return isIntervention ? (
            <TouchableOpacity
              onPress={() => navigation.navigate('InterventionDetail', { interventionId })}
              style={{ flex: 1 }}
            >
              {headerContent}
            </TouchableOpacity>
          ) : headerContent;
        })() : interventionTitle ? (
          <TouchableOpacity
            onPress={() => {
              const intId = route?.params?.interventionId;
              if (intId) navigation.navigate('InterventionDetail', { interventionId: intId });
            }}
            style={{ flex: 1 }}
          >
            <View style={styles.chatHeaderInfo}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={[styles.chatHeaderName, { textDecorationLine: 'underline' }]} numberOfLines={1}>
                  {interventionTitle}
                </Text>
                <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14 }}>↗</Text>
              </View>
              <Text style={styles.chatHeaderRole}>Appuyer pour voir l'intervention</Text>
            </View>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Messages */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        {loadingMessages && messages.length === 0 ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={accentColor} />
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.messagesList}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
            onLayout={() => flatListRef.current?.scrollToEnd({ animated: false })}
            ListEmptyComponent={
              <View style={styles.centerContainer}>
                <Text style={styles.emptySubtitle}>Envoyez le premier message !</Text>
              </View>
            }
            renderItem={({ item, index }) => {
              const isMe = item.sender_id === user?.id;
              const isSystem = item.sender_role === 'system';
              const showName = !isMe && !isSystem &&
                (index === 0 || messages[index - 1]?.sender_id !== item.sender_id);

              if (isSystem) {
                return (
                  <View style={styles.systemMessage}>
                    <Text style={styles.systemText}>{item.content}</Text>
                  </View>
                );
              }

              return (
                <View style={[styles.messageBubbleRow, isMe ? styles.messageRight : styles.messageLeft]}>
                  <View style={{ maxWidth: '80%' }}>
                    {showName && (
                      <Text style={styles.senderName}>
                        {getRoleEmoji(item.sender_role)} {item.sender_name}
                      </Text>
                    )}
                    <View style={[
                      styles.bubble,
                      isMe ? [styles.bubbleMe, { backgroundColor: accentColor }] : styles.bubbleOther,
                    ]}>
                      {(() => {
                        const att: any[] = typeof item.attachments === 'string'
                          ? (() => { try { return JSON.parse(item.attachments); } catch { return []; } })()
                          : (item.attachments || []);
                        return (
                          <>
                            {item.message_type === 'image' && att[0] && (
                              <Image source={{ uri: att[0].url }} style={styles.messageImage} resizeMode="cover" />
                            )}
                            {item.message_type === 'audio' && att[0] && (
                              <TouchableOpacity
                                onPress={() => playAudio(item.id, att[0].url)}
                                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 160, paddingVertical: 4 }}
                              >
                                <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: isMe ? 'rgba(255,255,255,0.25)' : '#e5e7eb', justifyContent: 'center', alignItems: 'center' }}>
                                  <Text style={{ fontSize: 14 }}>{playingAudioId === item.id ? '⏸' : '▶️'}</Text>
                                </View>
                                <View style={{ flex: 1 }}>
                                  <View style={{ height: 4, borderRadius: 2, backgroundColor: isMe ? 'rgba(255,255,255,0.3)' : '#d1d5db', overflow: 'hidden' }}>
                                    <View style={{ height: '100%', borderRadius: 2, backgroundColor: isMe ? '#fff' : accentColor, width: playingAudioId === item.id && audioDuration > 0 ? `${(audioProgress / audioDuration) * 100}%` : '0%' }} />
                                  </View>
                                  <Text style={{ fontSize: 10, marginTop: 2, color: isMe ? 'rgba(255,255,255,0.7)' : '#9ca3af' }}>
                                    {playingAudioId === item.id ? fmtMs(audioProgress) : '🎤 Vocal'}
                                  </Text>
                                </View>
                              </TouchableOpacity>
                            )}
                            {item.content ? (
                              <Text style={[styles.messageText, isMe && styles.messageTextMe]}>{item.content}</Text>
                            ) : null}
                          </>
                        );
                      })()}
                    </View>
                    <Text style={[styles.messageTime, isMe && styles.messageTimeRight]}>
                      {formatFullTime(item.created_at)}
                    </Text>
                  </View>
                </View>
              );
            }}
          />
        )}

        {/* Input */}
        {isRecording ? (
          <View style={[styles.inputBar, { backgroundColor: '#fef2f2' }]}>
            <TouchableOpacity onPress={cancelRecording} style={styles.attachButton}>
              <Text style={{ fontSize: 20 }}>✕</Text>
            </TouchableOpacity>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#ef4444' }} />
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#dc2626' }}>{fmtTime(recordingDuration)}</Text>
              <Text style={{ fontSize: 12, color: '#ef4444' }}>Enregistrement...</Text>
            </View>
            <TouchableOpacity
              onPress={stopAndSendRecording}
              style={[styles.sendButton, { backgroundColor: '#dc2626' }]}
            >
              <Text style={styles.sendText}>➤</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.inputBar}>
            <TouchableOpacity onPress={handlePickImage} style={styles.attachButton}>
              <Text style={{ fontSize: 20 }}>📎</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowEmojiPicker(!showEmojiPicker)} style={styles.attachButton}>
              <Text style={{ fontSize: 20 }}>😊</Text>
            </TouchableOpacity>
            <TextInput
              style={styles.textInput}
              value={messageInput}
              onChangeText={setMessageInput}
              placeholder="Écrire un message..."
              placeholderTextColor="#9ca3af"
              multiline
              maxLength={2000}
            />
            {messageInput.trim() || !isAudioAvailable ? (
              <TouchableOpacity
                onPress={handleSend}
                disabled={!messageInput.trim() || sending}
                style={[styles.sendButton, { backgroundColor: accentColor, opacity: messageInput.trim() ? 1 : 0.5 }]}
              >
                {sending ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.sendText}>➤</Text>}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={startRecording}
                style={[styles.sendButton, { backgroundColor: accentColor }]}
              >
                <Text style={styles.sendText}>🎙</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Emoji Picker */}
        {showEmojiPicker && (
          <View style={{ backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e5e7eb', paddingHorizontal: 10, paddingVertical: 8 }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', gap: 4 }}>
                {EMOJI_LIST.map(emoji => (
                  <TouchableOpacity key={emoji} onPress={() => { setMessageInput(prev => prev + emoji); setShowEmojiPicker(false); }} style={{ padding: 6 }}>
                    <Text style={{ fontSize: 24 }}>{emoji}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },
  backButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  backText: { fontSize: 22, color: '#fff', fontWeight: '600' },
  listContainer: { flex: 1, backgroundColor: '#fff' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  loadingText: { marginTop: 12, color: '#6b7280', fontSize: 14 },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: '#374151', marginTop: 12 },
  emptySubtitle: { fontSize: 14, color: '#9ca3af', marginTop: 4 },

  // Conversation list
  convItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  convInfo: { flex: 1 },
  convTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  convName: { fontSize: 15, color: '#374151', flex: 1, marginRight: 8 },
  convNameBold: { fontWeight: '700', color: '#111827' },
  convTime: { fontSize: 12, color: '#9ca3af' },
  convBottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 3 },
  convPreview: { fontSize: 13, color: '#9ca3af', flex: 1, marginRight: 8 },
  convPreviewBold: { color: '#374151', fontWeight: '600' },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  unreadText: { color: '#fff', fontSize: 11, fontWeight: '700' },

  // Chat
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 12,
  },
  chatHeaderInfo: { flex: 1, marginLeft: 4 },
  chatHeaderName: { fontSize: 16, fontWeight: '600', color: '#fff' },
  chatHeaderRole: { fontSize: 12, color: 'rgba(255,255,255,0.7)' },
  messagesList: { padding: 12, paddingBottom: 8 },
  systemMessage: { alignItems: 'center', marginVertical: 8 },
  systemText: { fontSize: 12, color: '#9ca3af', backgroundColor: '#f3f4f6', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  messageBubbleRow: { marginBottom: 4 },
  messageRight: { alignItems: 'flex-end' },
  messageLeft: { alignItems: 'flex-start' },
  senderName: { fontSize: 11, color: '#6b7280', marginBottom: 2, marginLeft: 4 },
  bubble: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8, maxWidth: '100%' },
  bubbleMe: { borderBottomRightRadius: 4 },
  bubbleOther: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', borderBottomLeftRadius: 4 },
  messageText: { fontSize: 15, color: '#1f2937', lineHeight: 20 },
  messageTextMe: { color: '#fff' },
  messageImage: { width: 200, height: 150, borderRadius: 12, marginBottom: 4 },
  messageTime: { fontSize: 10, color: '#9ca3af', marginTop: 2, marginLeft: 4 },
  messageTimeRight: { textAlign: 'right', marginRight: 4 },

  // Input bar
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 8,
    paddingBottom: Platform.OS === 'ios' ? 24 : 8,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  attachButton: { padding: 8, justifyContent: 'center' },
  textInput: {
    flex: 1,
    backgroundColor: '#f3f4f6',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    maxHeight: 100,
    marginHorizontal: 6,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendText: { color: '#fff', fontSize: 18 },
});
