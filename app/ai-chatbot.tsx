import React, { useState, useEffect, useRef } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Image, TextInput, Animated, KeyboardAvoidingView, Platform, Dimensions, FlatList } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import * as Location from "expo-location";
import { useStore } from "../store/useStore";
import { COLORS } from "../constants/theme";
import { useRoutes } from "../hooks/useRoutes";
import { getChatbotReply, type ChatbotConversationState } from "../services/chatbotService";

const { width } = Dimensions.get("window");

const CHATBOT_STATES = {
  IDLE: require("../assets/AIChatbot/IDLE.png"),
  ASK: require("../assets/AIChatbot/ASK.png"),
  PROCESSING: require("../assets/AIChatbot/PROCESSING.png"),
  SUCCESS: require("../assets/AIChatbot/SUCCESS.png"),
  ERROR: require("../assets/AIChatbot/ERROR.png"),
  NAVIGATION: require("../assets/AIChatbot/NAVIGATION.png"),
  PAYMENT: require("../assets/AIChatbot/PAYMENT.png"),
  POWER_OFF: require("../assets/AIChatbot/POWER OFF.png"),
};

type ChatMessage = {
  id: string;
  text: string;
  isUser: boolean;
};

export default function AIChatbotScreen() {
  const [currentState, setCurrentState] = useState<keyof typeof CHATBOT_STATES>("IDLE");
  const [inputText, setInputText] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationState, setConversationState] = useState<ChatbotConversationState>({});
  const [currentLocation, setCurrentLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [currentLocationLabel, setCurrentLocationLabel] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const floatAnim = useRef(new Animated.Value(0)).current;
  const flatListRef = useRef<FlatList<ChatMessage>>(null);
  const { routes } = useRoutes();
  const user = useStore((state: any) => state.user);
  const firstName = user?.full_name?.split(" ")[0] || "Commuter";

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

  const handleAction = (nextState: keyof typeof CHATBOT_STATES) => {
    setCurrentState("PROCESSING");
    setTimeout(() => {
      setCurrentState(nextState);
      setTimeout(() => {
        if(nextState !== "POWER_OFF") setCurrentState("IDLE");
      }, 3000);
    }, 1200);
  };

  const handleSend = async () => {
    if (!inputText.trim() || isSending) return;

    const messageText = inputText.trim();
    const userMessage: ChatMessage = { id: Date.now().toString(), text: messageText, isUser: true };
    setMessages((prev) => [...prev, userMessage]);
    setInputText("");
    setCurrentState("PROCESSING");
    setIsSending(true);

    try {
      const response = await getChatbotReply({
        message: messageText,
        state: conversationState,
        routes,
        currentLocation,
        currentLocationLabel,
      });

      setConversationState(response.state);

      const aiResponse: ChatMessage = {
        id: `${Date.now()}-ai`,
        text: response.text,
        isUser: false,
      };

      setMessages((prev) => [...prev, aiResponse]);
      setCurrentState("SUCCESS");
    } catch {
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

  return (
    <LinearGradient
      colors={[COLORS.background, "#FDE8A8", "#D7F3DE"]}
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.iconButton}>
            <Ionicons name="chevron-back" size={28} color={COLORS.navy} />
          </TouchableOpacity>
        </View>

        {messages.length === 0 ? (
          <>
            <View style={styles.greetingContainer}>
              <Text style={styles.greetingTitle}>Hello, {firstName}!</Text>
              <Text style={styles.greetingSubtitle}>How can I help you today?</Text>
            </View>

            <View style={styles.aiContainer}>
              <Animated.View style={[styles.aiGlowWrap, { transform: [{ translateY: floatAnim }] }]}>
                <View style={styles.aiImagePortal}>
                  <Image 
                    source={CHATBOT_STATES[currentState]}
                    style={styles.chatbotImage}
                  />
                </View>
              </Animated.View>
              <View style={styles.aiShadow} />
            </View>

            <View style={styles.actionsGrid}>
              <TouchableOpacity style={styles.actionCard} onPress={() => handleAction("NAVIGATION")}>
                <Ionicons name="map" size={20} color={COLORS.navy} />
                <Text style={styles.actionText}>Find a route</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionCard} onPress={() => handleAction("ASK")}>
                <Ionicons name="bulb" size={20} color={COLORS.navy} />
                <Text style={styles.actionText}>Nearest places</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionCard} onPress={() => handleAction("PAYMENT")}>
                <Ionicons name="wallet" size={20} color={COLORS.navy} />
                <Text style={styles.actionText}>Check fares</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionCard} onPress={() => handleAction("SUCCESS")}>
                <Ionicons name="scan" size={20} color={COLORS.navy} />
                <Text style={styles.actionText}>Scan signboard</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.chatContainer}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
            onLayout={() => flatListRef.current?.scrollToEnd({ animated: true })}
            renderItem={({ item }) => (
              <View style={[styles.messageBubble, item.isUser ? styles.userBubble : styles.aiBubble]}>
                <Text style={[styles.messageText, item.isUser ? styles.userMessageText : styles.aiMessageText]}>
                  {item.text}
                </Text>
              </View>
            )}
            style={{ flex: 1 }}
          />
        )}

        <KeyboardAvoidingView 
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.inputContainer}
        >
          <View style={styles.inputWrapper}>
            <TextInput 
              style={styles.textInput}
              placeholder="Ask about fares, routes, or jeepney trivia..."
              placeholderTextColor={COLORS.textMuted}
              value={inputText}
              onChangeText={setInputText}
              onSubmitEditing={handleSend}
            />

            <TouchableOpacity style={[styles.micButton, isSending ? { opacity: 0.6 } : null]} onPress={handleSend} disabled={isSending}>
              <Ionicons 
                name={inputText.trim() ? "send" : "mic"} 
                size={22} 
                color={"#FFFFFF"} 
                style={inputText.trim() ? { transform: [{ translateX: 2 }, { translateY: -1 }] } : {}}
              />
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
  greetingContainer: { alignItems: "center", marginTop: 20 },
  greetingTitle: { fontSize: 24, fontWeight: "400", color: COLORS.navy, marginBottom: 8 },
  greetingSubtitle: { fontSize: 26, fontWeight: "500", color: COLORS.navy },
  aiContainer: { flex: 1, alignItems: "center", justifyContent: "center" },
  aiGlowWrap: { width: 250, height: 250, borderRadius: 125, backgroundColor: "rgba(255,255,255,0.5)", alignItems: "center", justifyContent: "center", shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 30, elevation: 20, borderWidth: 2, borderColor: "rgba(255,255,255,0.8)" },
  aiImagePortal: { width: 220, height: 220, borderRadius: 110, overflow: "hidden", backgroundColor: "#CBA962", alignItems: "center", justifyContent: "center" },
  chatbotImage: { width: "100%", height: "100%", resizeMode: "contain" },
  aiShadow: { width: 120, height: 12, borderRadius: 6, backgroundColor: "rgba(10, 22, 40, 0.1)", marginTop: 30, transform: [{ scaleX: 2 }] },
  actionsGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", paddingHorizontal: 24, marginBottom: 30 },
  actionCard: { width: (width - 64) / 2, flexDirection: "row", alignItems: "center", backgroundColor: "rgba(255, 255, 255, 0.85)", paddingVertical: 14, paddingHorizontal: 12, borderRadius: 16, marginBottom: 12, gap: 8 },
  actionText: { fontSize: 14, fontWeight: "500", color: COLORS.navy },
  chatContainer: { paddingHorizontal: 24, paddingVertical: 20, gap: 16 },
  messageBubble: { maxWidth: "80%", padding: 14, borderRadius: 20 },
  userBubble: { backgroundColor: COLORS.primary, alignSelf: "flex-end", borderBottomRightRadius: 4 },
  aiBubble: { backgroundColor: "rgba(255,255,255,0.85)", alignSelf: "flex-start", borderBottomLeftRadius: 4, borderWidth: 1, borderColor: "rgba(255,255,255,0.5)" },
  messageText: { fontSize: 16, lineHeight: 22 },
  userMessageText: { color: "#FFFFFF" },
  aiMessageText: { color: COLORS.navy },
  inputContainer: { paddingHorizontal: 24, paddingBottom: 20 },
  inputWrapper: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(255, 255, 255, 0.85)", borderRadius: 999, paddingLeft: 20, paddingRight: 8, paddingVertical: 8, borderWidth: 1, borderColor: "rgba(255, 255, 255, 0.8)" },
  textInput: { flex: 1, height: 40, fontSize: 16, color: COLORS.navy },
  micButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center", shadowColor: "transparent", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 6 }
});
