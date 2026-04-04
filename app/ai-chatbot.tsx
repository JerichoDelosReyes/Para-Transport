import React, { useState, useEffect, useRef } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Image, TextInput, Animated, KeyboardAvoidingView, Platform, FlatList, Keyboard, Alert, ActivityIndicator } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import * as Location from "expo-location";
import { COLORS } from "../constants/theme";
import { useRoutes } from "../hooks/useRoutes";
import { getChatbotReply, type ChatbotConversationState } from "../services/chatbotService";
import { useStore } from "../store/useStore";
import { supabase } from '../config/supabaseClient';

const CHATBOT_STATES = {
  IDLE: require("../assets/AIChatbot/IDLE.png"),
  PROCESSING: require("../assets/AIChatbot/PROCESSING.png"),
  SUCCESS: require("../assets/AIChatbot/SUCCESS.png"),
  ERROR: require("../assets/AIChatbot/ERROR.png"),
};
const JEEPIE_AVATAR = require("../assets/AIChatbot/Jeepie.png");
const MIN_TYPING_DURATION_MS = 900;

type ChatMessage = {
  id: string;
  text: string;
  isUser: boolean;
};

const BOT_NAME = "Jeepie";

export default function AIChatbotScreen() {
  const insets = useSafeAreaInsets();
  const [currentState, setCurrentState] = useState<keyof typeof CHATBOT_STATES>("IDLE");
  const [inputText, setInputText] = useState("");
  const storedMessages = useStore((state: any) => state.chatbotMessages || []);
  const storedConversationState = useStore((state: any) => state.chatbotConversationState || {});
  const setStoredMessages = useStore((state: any) => state.setChatbotMessages);
  const setStoredConversationState = useStore((state: any) => state.setChatbotConversationState);
  const clearChatbotMemory = useStore((state: any) => state.clearChatbotMemory);
  const [messages, setMessages] = useState<ChatMessage[]>(() => storedMessages as ChatMessage[]);
  const [conversationState, setConversationState] = useState<ChatbotConversationState>(
    () => storedConversationState as ChatbotConversationState,
  );
  const [currentLocation, setCurrentLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [currentLocationLabel, setCurrentLocationLabel] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isTagalogGreeting, setIsTagalogGreeting] = useState(false);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const floatAnim = useRef(new Animated.Value(0)).current;
  const greetingOpacity = useRef(new Animated.Value(1)).current;
  const typingPulse = useRef(new Animated.Value(0)).current;
  const flatListRef = useRef<FlatList<ChatMessage>>(null);
  const { routes } = useRoutes();
  const user = useStore((state: any) => state.user);
  const sessionMode = useStore((state: any) => state.sessionMode);

  const authName = typeof user?.username === "string" ? user.username.trim() : "";
  const preferredName = sessionMode === "auth" && authName.length > 0
    ? authName
    : null;
  const hasConversation = messages.length > 0;

  useEffect(() => {
    if (messages.length === 0 && storedMessages.length > 0) {
      setMessages(storedMessages as ChatMessage[]);
    }
  }, [storedMessages, messages.length]);

  useEffect(() => {
    const localStateEmpty = Object.keys(conversationState || {}).length === 0;
    const storedStateHasValue = Object.keys(storedConversationState || {}).length > 0;
    const localHasMessages = messages.length > 0;
    const storedHasMessages = storedMessages.length > 0;

    if (localStateEmpty && !localHasMessages && storedStateHasValue && storedHasMessages) {
      setConversationState(storedConversationState as ChatbotConversationState);
    }
  }, [storedConversationState, conversationState, messages.length, storedMessages.length]);

  useEffect(() => {
    setStoredMessages(messages);
  }, [messages, setStoredMessages]);

  useEffect(() => {
    setStoredConversationState(conversationState);
  }, [conversationState, setStoredConversationState]);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, {
          toValue: -15,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(floatAnim, {
          toValue: 0,
          duration: 2000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [floatAnim]);

  useEffect(() => {
    if (messages.length > 0) return;

    const interval = setInterval(() => {
      Animated.timing(greetingOpacity, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }).start(() => {
        setIsTagalogGreeting((prev) => !prev);
        Animated.timing(greetingOpacity, {
          toValue: 1,
          duration: 260,
          useNativeDriver: true,
        }).start();
      });
    }, 3800);

    return () => clearInterval(interval);
  }, [greetingOpacity, messages.length]);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showSub = Keyboard.addListener(showEvent, () => setIsKeyboardVisible(true));
    const hideSub = Keyboard.addListener(hideEvent, () => setIsKeyboardVisible(false));

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    if (!isSending) {
      typingPulse.stopAnimation();
      typingPulse.setValue(0);
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(typingPulse, {
          toValue: 1,
          duration: 720,
          useNativeDriver: true,
        }),
        Animated.timing(typingPulse, {
          toValue: 0,
          duration: 120,
          useNativeDriver: true,
        }),
      ]),
    );

    loop.start();
    return () => loop.stop();
  }, [isSending, typingPulse]);

  useEffect(() => {
    let mounted = true;

    const loadLocation = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted" || !mounted) return;

        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        if (!mounted) return;

        const coord = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };

        setCurrentLocation(coord);

        const geocoded = await Location.reverseGeocodeAsync(coord);
        if (!mounted || geocoded.length === 0) return;

        const top = geocoded[0];
        const parts = [top.name, top.district, top.city].filter(Boolean);
        if (parts.length > 0) {
          setCurrentLocationLabel(parts.join(", "));
        }
      } catch {
        // Location is optional for chatbot flow.
      }
    };

    loadLocation();

    return () => {
      mounted = false;
    };
  }, []);

  const handleSend = async () => {
    if (!inputText.trim() || isSending) return;

    const messageText = inputText.trim();
    const userMessage: ChatMessage = { id: Date.now().toString(), text: messageText, isUser: true };
    const conversationHistory: Array<{ text: string; isUser: boolean }> = [
      ...messages.map((entry) => ({ text: entry.text, isUser: entry.isUser })),
      { text: userMessage.text, isUser: true },
    ];
    setMessages((prev) => [...prev, userMessage]);
    setInputText("");
    setCurrentState("PROCESSING");
    setIsSending(true);
    const startedAt = Date.now();

    const waitForTyping = async () => {
      const elapsed = Date.now() - startedAt;
      const remaining = Math.max(0, MIN_TYPING_DURATION_MS - elapsed);
      if (remaining > 0) {
        await new Promise((resolve) => setTimeout(resolve, remaining));
      }
    };

    try {
      // Yield to JS event loop so React Native can render "jeepie is typing"
      // and allow the user to press back before the heavy route computation begins
      await new Promise((resolve) => setTimeout(resolve, 50));

      const response = await getChatbotReply({
        message: messageText,
        mode: "companion",
        state: conversationState,
        history: conversationHistory,
        routes,
        currentLocation,
        currentLocationLabel,
      });

      await waitForTyping();

      setConversationState(response.state);

      const aiResponse: ChatMessage = {
        id: `${Date.now()}-ai`,
        text: response.text,
        isUser: false,
      };

      setMessages((prev) => [...prev, aiResponse]);
      setCurrentState("SUCCESS");

      // Phase 3: Insert log into Supabase if user is authenticated
      // Wrapped in an async IIFE to prevent ANY database errors from crashing the UI response
      if (sessionMode === "auth" && user?.id) {
        (async () => {
          try {
            const { error } = await supabase.from("chatbot_logs").insert({
              user_id: user.id,
              query: messageText, // <-- updated from 'message' to 'query'
              response: response.text,
            });
            if (error) console.log("Failed to log chatbot interaction:", error);
          } catch (e) {
            console.log("Exception logging chatbot interaction:", e);
          }
        })();
      }
    } catch {
      await waitForTyping();
      setCurrentState("ERROR");
      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-error`,
          text: "Sorry, I ran into an error while processing your request. Please try again.",
          isUser: false,
        },
      ]);
    } finally {
      setIsSending(false);
      setTimeout(() => {
        setCurrentState("IDLE");
      }, 2000);
    }
  };

  const clearChatNow = () => {
    clearChatbotMemory();
    setMessages([]);
    setConversationState({});
    setInputText("");
    setCurrentState("IDLE");
  };

  const handleClearChat = () => {
    Alert.alert(
      "Clear chat?",
      "This will remove the current conversation and route context.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Clear", style: "destructive", onPress: clearChatNow },
      ],
    );
  };

  return (
    <LinearGradient
      colors={[COLORS.background, "#FDE8A8", "#D7F3DE"]}
      style={styles.container}
    >
      <SafeAreaView
        style={styles.safeArea}
        edges={hasConversation ? ["left", "right", "bottom"] : ["top", "left", "right", "bottom"]}
      >
        {hasConversation ? (
          <View style={[styles.chatHeader, { paddingTop: insets.top + 10 }]}> 
            <TouchableOpacity onPress={() => router.back()} style={styles.chatHeaderBackButton}>
              <Ionicons name="chevron-back" size={24} color={COLORS.navy} />
            </TouchableOpacity>
            <View style={styles.chatHeaderAvatarWrap}>
              <Image source={JEEPIE_AVATAR} style={styles.chatHeaderAvatarImage} />
            </View>
            <View style={styles.chatHeaderInfo}>
              <Text style={styles.chatHeaderName}>{BOT_NAME}</Text>
              <View style={styles.chatStatusRow}>
                <View style={styles.onlineDot} />
                <Text style={styles.chatHeaderStatus}>Online</Text>
              </View>
            </View>
            <TouchableOpacity onPress={handleClearChat} style={styles.chatHeaderClearButton}>
              <Ionicons name="trash-outline" size={18} color={COLORS.navy} />
              <Text style={styles.chatHeaderClearText}>Clear</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={styles.iconButton}>
              <Ionicons name="chevron-back" size={28} color={COLORS.navy} />
            </TouchableOpacity>
          </View>
        )}

        {messages.length === 0 ? (
          <>
            <Animated.View style={[styles.greetingContainer, { opacity: greetingOpacity }]}>
              <Text style={styles.greetingTitle}>
                {isTagalogGreeting
                  ? `Kumusta, ${preferredName || "Komyuter"}!`
                  : `Hello, ${preferredName || "Commuter"}!`}
              </Text>
              <Text
                style={styles.greetingSubtitle}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.78}
              >
                {isTagalogGreeting ? "Ano ang maitutulong ko sa'yo?" : "How can I help you today?"}
              </Text>
            </Animated.View>

            <View style={[styles.aiContainer, isKeyboardVisible ? styles.aiContainerKeyboard : null]}>
              <Animated.View
                style={[
                  styles.aiGlowWrap,
                  isKeyboardVisible ? styles.aiGlowWrapKeyboard : null,
                  { transform: [{ translateY: isKeyboardVisible ? 0 : floatAnim }] },
                ]}
              >
                <View style={[styles.aiImagePortal, isKeyboardVisible ? styles.aiImagePortalKeyboard : null]}>
                  <Image 
                    source={CHATBOT_STATES[currentState]}
                    style={styles.chatbotImage}
                  />
                </View>
              </Animated.View>
              {!isKeyboardVisible && <View style={styles.aiShadow} />}
            </View>
          </>
        ) : (
          <View style={styles.chatBody}>
            <FlatList
              ref={flatListRef}
              data={messages}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.chatContainer}
              onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
              onLayout={() => flatListRef.current?.scrollToEnd({ animated: true })}
              renderItem={({ item }) => {
                if (item.isUser) {
                  return (
                    <View style={styles.userMessageRow}>
                      <View style={[styles.messageBubble, styles.userBubble]}>
                        <Text style={[styles.messageText, styles.userMessageText]}>
                          {item.text}
                        </Text>
                      </View>
                    </View>
                  );
                }

                return (
                  <View style={styles.aiMessageRow}>
                    <View style={styles.aiMessageAvatarWrap}>
                      <Image source={JEEPIE_AVATAR} style={styles.aiMessageAvatarImage} />
                    </View>
                    <View style={[styles.messageBubble, styles.aiBubble]}>
                      <Text style={[styles.messageText, styles.aiMessageText]}>
                        {item.text}
                      </Text>
                    </View>
                  </View>
                );
              }}
              ListFooterComponent={() => 
                isSending ? (
                  <View style={[styles.aiMessageRow, { marginTop: 8 }]}>
                    <View style={styles.aiMessageAvatarWrap}>
                      <Image source={JEEPIE_AVATAR} style={styles.aiMessageAvatarImage} />
                    </View>
                    <View style={[styles.messageBubble, styles.aiBubble, styles.typingBubble]}>
                      <View style={styles.typingDotsRow}>
                        {[0, 1, 2].map((dotIndex) => {
                          const start = dotIndex * 0.22;
                          const dotOpacity = typingPulse.interpolate({
                            inputRange: [start, start + 0.16, start + 0.34, 1],
                            outputRange: [0.26, 0.92, 0.26, 0.26],
                            extrapolate: "clamp",
                          });

                          return (
                            <Animated.View
                              key={dotIndex}
                              style={[styles.typingDot, { opacity: dotOpacity }]}
                            />
                          );
                        })}
                      </View>
                      <Text style={styles.typingText}>Jeepie is typing</Text>
                    </View>
                  </View>
                ) : null
              }
              style={styles.chatList}
            />
          </View>
        )}

        <KeyboardAvoidingView 
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={[styles.inputContainer, hasConversation ? styles.inputContainerChat : null]}
        >
          <View style={[styles.inputWrapper, hasConversation ? styles.inputWrapperChat : null]}>
            <TextInput 
              style={styles.textInput}
              placeholder="Ask Jeepie"
              placeholderTextColor={COLORS.textMuted}
              value={inputText}
              onChangeText={setInputText}
              onSubmitEditing={handleSend}
            />

            <TouchableOpacity style={[styles.micButton, isSending ? { opacity: 0.6 } : null]} onPress={handleSend} disabled={isSending}>
              {isSending ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Ionicons 
                  name={inputText.trim() ? "send" : "mic"} 
                  size={22} 
                  color={"#FFFFFF"} 
                  style={inputText.trim() ? { transform: [{ translateX: 2 }, { translateY: -1 }] } : {}}
                />
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, justifyContent: "space-between" },
  header: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 24, paddingTop: 10 },
  iconButton: { width: 44, height: 44, backgroundColor: "#FFFFFF", borderRadius: 22, alignItems: "center", justifyContent: "center", shadowColor: COLORS.navy, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 4 },
  chatHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingBottom: 12,
    backgroundColor: "#F3C641",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(10, 22, 40, 0.12)",
  },
  chatHeaderBackButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.65)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  chatHeaderAvatarWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#E0B258",
    overflow: "hidden",
    marginRight: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.7)",
  },
  chatHeaderAvatarImage: { width: "100%", height: "100%", resizeMode: "cover" },
  chatHeaderInfo: { flex: 1 },
  chatHeaderName: { color: COLORS.navy, fontSize: 18, fontWeight: "700" },
  chatHeaderClearButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.65)",
    borderWidth: 1,
    borderColor: "rgba(10,22,40,0.14)",
    columnGap: 4,
  },
  chatHeaderClearText: {
    color: COLORS.navy,
    fontSize: 12,
    fontWeight: "700",
  },
  chatStatusRow: { flexDirection: "row", alignItems: "center", marginTop: 1 },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#23C552",
    marginRight: 6,
  },
  chatHeaderStatus: { color: "rgba(10,22,40,0.8)", fontSize: 13, marginTop: 1 },
  greetingContainer: { alignItems: "center", marginTop: 20, paddingHorizontal: 24 },
  greetingTitle: { fontSize: 24, fontWeight: "400", color: COLORS.navy, marginBottom: 8 },
  greetingSubtitle: { fontSize: 22, fontWeight: "500", color: COLORS.navy, textAlign: "center" },
  aiContainer: { flex: 1, alignItems: "center", justifyContent: "center", marginTop: 10 },
  aiContainerKeyboard: { flex: 0, marginTop: 18, marginBottom: 14 },
  aiGlowWrap: { width: 250, height: 250, borderRadius: 125, backgroundColor: "rgba(255,255,255,0.5)", alignItems: "center", justifyContent: "center", shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 30, elevation: 20, borderWidth: 2, borderColor: "rgba(255,255,255,0.8)" },
  aiGlowWrapKeyboard: { width: 180, height: 180, borderRadius: 90, shadowOpacity: 0.3, shadowRadius: 16 },
  aiImagePortal: { width: 220, height: 220, borderRadius: 110, overflow: "hidden", backgroundColor: "#CBA962", alignItems: "center", justifyContent: "center" },
  aiImagePortalKeyboard: { width: 160, height: 160, borderRadius: 80 },
  chatbotImage: { width: "100%", height: "100%", resizeMode: "contain" },
  aiShadow: { width: 120, height: 12, borderRadius: 6, backgroundColor: "rgba(10, 22, 40, 0.1)", marginTop: 30, transform: [{ scaleX: 2 }] },
  chatBody: { flex: 1, backgroundColor: "transparent" },
  chatList: { flex: 1 },
  chatContainer: { paddingHorizontal: 16, paddingVertical: 16, gap: 14, paddingBottom: 24 },
  userMessageRow: { width: "100%", alignItems: "flex-end" },
  aiMessageRow: { width: "100%", flexDirection: "row", alignItems: "flex-end", columnGap: 8, paddingRight: 28 },
  aiMessageAvatarWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    overflow: "hidden",
    backgroundColor: "#E0B258",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.75)",
    marginBottom: 2,
  },
  aiMessageAvatarImage: { width: "100%", height: "100%", resizeMode: "cover" },
  messageBubble: { maxWidth: "82%", paddingHorizontal: 14, paddingVertical: 11, borderRadius: 20 },
  userBubble: { backgroundColor: COLORS.navy, borderBottomRightRadius: 4, shadowColor: "#001326", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4, elevation: 2 },
  aiBubble: { backgroundColor: "#FFFFFF", borderBottomLeftRadius: 4, borderWidth: 1, borderColor: "rgba(10, 22, 40, 0.08)", shadowColor: "#001326", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 1 },
  messageText: { fontSize: 16, lineHeight: 22 },
  userMessageText: { color: "#FFFFFF" },
  aiMessageText: { color: COLORS.navy },
  typingBubble: {
    paddingVertical: 10,
  },
  typingDotsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    columnGap: 6,
    marginBottom: 5,
  },
  typingDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: COLORS.navy,
    opacity: 0.26,
  },
  typingText: {
    fontSize: 12,
    color: COLORS.textMuted,
    fontWeight: "600",
  },
  inputContainer: { paddingHorizontal: 24, paddingBottom: 20 },
  inputContainerChat: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
    borderTopWidth: 0,
    borderTopColor: "transparent",
    backgroundColor: "transparent",
  },
  inputWrapper: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(255, 255, 255, 0.85)", borderRadius: 999, paddingLeft: 20, paddingRight: 8, paddingVertical: 8, borderWidth: 1, borderColor: "rgba(255, 255, 255, 0.8)" },
  inputWrapperChat: {
    backgroundColor: "#FFFFFF",
    borderColor: "rgba(10,22,40,0.12)",
  },
  textInput: { flex: 1, height: 40, fontSize: 16, color: COLORS.navy },
  micButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center", shadowColor: "transparent", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 6 }
});
