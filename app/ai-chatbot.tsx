import React, { useState, useEffect, useRef } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Image, TextInput, Animated, KeyboardAvoidingView, Platform, Dimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";

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

export default function AIChatbotScreen() {
  const [currentState, setCurrentState] = useState("IDLE");
  const floatAnim = useRef(new Animated.Value(0)).current;

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

  const handleAction = (nextState) => {
    setCurrentState("PROCESSING");
    setTimeout(() => {
      setCurrentState(nextState);
      setTimeout(() => {
        if(nextState !== "POWER_OFF") setCurrentState("IDLE");
      }, 3000);
    }, 1200);
  };

  return (
    <LinearGradient
      colors={["#D2E5FE", "#F6E4FB", "#D2F5F8"]}
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.iconButton}>
            <Ionicons name="menu" size={24} color="#6B52AE" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconButton}>
            <Ionicons name="settings-sharp" size={22} color="#6B52AE" />
          </TouchableOpacity>
        </View>

        <View style={styles.greetingContainer}>
          <Text style={styles.greetingTitle}>Hello, Commuter!</Text>
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
            <Ionicons name="map" size={20} color="#6B52AE" />
            <Text style={styles.actionText}>Find a route</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionCard} onPress={() => handleAction("ASK")}>
            <Ionicons name="bulb" size={20} color="#6B52AE" />
            <Text style={styles.actionText}>Nearest places</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionCard} onPress={() => handleAction("PAYMENT")}>
            <Ionicons name="wallet" size={20} color="#6B52AE" />
            <Text style={styles.actionText}>Check fares</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionCard} onPress={() => handleAction("SUCCESS")}>
            <Ionicons name="language" size={20} color="#6B52AE" />
            <Text style={styles.actionText}>Translate sign</Text>
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView 
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.inputContainer}
        >
          <View style={styles.inputWrapper}>
            <TouchableOpacity style={styles.plusButton}>
              <Ionicons name="add" size={24} color="#6B52AE" />
            </TouchableOpacity>
            
            <TextInput 
              style={styles.textInput}
              placeholder="Ask me anything..."
              placeholderTextColor="#8A7FA0"
            />

            <TouchableOpacity style={styles.micButton}>
              <Ionicons name="mic" size={26} color="#FFFFFF" />
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
  iconButton: { width: 44, height: 44, backgroundColor: "#FFFFFF", borderRadius: 22, alignItems: "center", justifyContent: "center", shadowColor: "#6B52AE", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 4 },
  greetingContainer: { alignItems: "center", marginTop: 20 },
  greetingTitle: { fontSize: 24, fontWeight: "400", color: "#2A1B54", marginBottom: 8 },
  greetingSubtitle: { fontSize: 26, fontWeight: "500", color: "#2A1B54" },
  aiContainer: { flex: 1, alignItems: "center", justifyContent: "center" },
  aiGlowWrap: { width: 250, height: 250, borderRadius: 125, backgroundColor: "rgba(255,255,255,0.4)", alignItems: "center", justifyContent: "center", shadowColor: "#9C7CF6", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 30, elevation: 20, borderWidth: 2, borderColor: "rgba(255,255,255,0.8)" },
  aiImagePortal: { width: 220, height: 220, borderRadius: 110, overflow: "hidden", backgroundColor: "#000000", alignItems: "center", justifyContent: "center" },
  chatbotImage: { width: "100%", height: "100%", resizeMode: "contain" },
  aiShadow: { width: 120, height: 12, borderRadius: 6, backgroundColor: "rgba(107, 82, 174, 0.2)", marginTop: 30, transform: [{ scaleX: 2 }] },
  actionsGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", paddingHorizontal: 24, marginBottom: 30 },
  actionCard: { width: (width - 64) / 2, flexDirection: "row", alignItems: "center", backgroundColor: "rgba(255, 255, 255, 0.6)", paddingVertical: 14, paddingHorizontal: 12, borderRadius: 16, marginBottom: 12, gap: 8 },
  actionText: { fontSize: 14, fontWeight: "500", color: "#342366" },
  inputContainer: { paddingHorizontal: 24, paddingBottom: 20 },
  inputWrapper: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(255, 255, 255, 0.6)", borderRadius: 999, padding: 8, borderWidth: 1, borderColor: "rgba(255, 255, 255, 0.8)" },
  plusButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(107, 82, 174, 0.1)", alignItems: "center", justifyContent: "center" },
  textInput: { flex: 1, height: 40, paddingHorizontal: 12, fontSize: 16, color: "#342366" },
  micButton: { width: 48, height: 48, borderRadius: 24, backgroundColor: "#9575FF", alignItems: "center", justifyContent: "center", shadowColor: "#9C7CF6", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 6 }
});
