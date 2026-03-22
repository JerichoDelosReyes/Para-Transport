import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, ScrollView, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

// The images for each chatbot state, located in assets/AIChatbot/
const CHATBOT_STATES = {
  IDLE: require('../assets/AIChatbot/IDLE.png'),
  ASK: require('../assets/AIChatbot/ASK.png'),
  PROCESSING: require('../assets/AIChatbot/PROCESSING.png'),
  SUCCESS: require('../assets/AIChatbot/SUCCESS.png'),
  ERROR: require('../assets/AIChatbot/ERROR.png'),
  NAVIGATION: require('../assets/AIChatbot/NAVIGATION.png'),
  PAYMENT: require('../assets/AIChatbot/PAYMENT.png'),
  POWER_OFF: require('../assets/AIChatbot/POWER OFF.png'),
};

export default function AIChatbotScreen() {
  const [currentState, setCurrentState] = useState<keyof typeof CHATBOT_STATES>('IDLE');
  
  // We use black (#000000) as the blending background color. 
  // If the assets have a specific shade of dark/light, update this HEX code below to perfectly match it.
  const BLEND_BACKGROUND_COLOR = '#000000';

  // Demo interactions
  const handleAction = (nextState: keyof typeof CHATBOT_STATES) => {
    setCurrentState('PROCESSING');
    setTimeout(() => {
      setCurrentState(nextState);
    }, 1500);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: BLEND_BACKGROUND_COLOR }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Para AI Assistant</Text>
        <TouchableOpacity onPress={() => setCurrentState('POWER_OFF')} style={styles.powerBtn}>
          <Ionicons name="power" size={24} color="#FF4444" />
        </TouchableOpacity>
      </View>

      {/* Main Representation Area */}
      <View style={[styles.imageContainer, { backgroundColor: BLEND_BACKGROUND_COLOR }]}>
        <Image 
          source={CHATBOT_STATES[currentState]}
          style={styles.chatbotImage}
          resizeMode="contain"
        />
      </View>

      {/* Control Panel (Mock functionality) */}
      <View style={styles.controlPanel}>
        <Text style={styles.statusText}>Current State: {currentState}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.actionRow}>
          <TouchableOpacity style={styles.actionButton} onPress={() => handleAction('ASK')}>
            <Ionicons name="chatbubbles" size={20} color="#000" />
            <Text style={styles.actionText}>Ask Route</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={() => handleAction('NAVIGATION')}>
            <Ionicons name="navigate" size={20} color="#000" />
            <Text style={styles.actionText}>Navigate</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={() => handleAction('PAYMENT')}>
            <Ionicons name="card" size={20} color="#000" />
            <Text style={styles.actionText}>Payment</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={() => handleAction('SUCCESS')}>
            <Ionicons name="checkmark-circle" size={20} color="#000" />
            <Text style={styles.actionText}>Success</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={() => handleAction('ERROR')}>
            <Ionicons name="warning" size={20} color="#000" />
            <Text style={styles.actionText}>Error</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={() => setCurrentState('IDLE')}>
            <Ionicons name="refresh" size={20} color="#000" />
            <Text style={styles.actionText}>Reset</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
  },
  backButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  powerBtn: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 68, 68, 0.2)',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  imageContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chatbotImage: {
    width: '100%',
    height: '100%',
  },
  controlPanel: {
    padding: 20,
    paddingBottom: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
  },
  statusText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 15,
    textAlign: 'center',
    opacity: 0.8,
  },
  actionRow: {
    gap: 12,
    alignItems: 'center',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5C518',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 24,
    gap: 8,
  },
  actionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000000',
  },
});