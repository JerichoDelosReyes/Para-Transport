import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, BackHandler, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../store/useStore';
import { supabase } from '../config/supabaseClient';
import { useRouter } from 'expo-router';

export function GlobalBannedModal() {
  const isVisible = useStore(state => state.isBannedPopupVisible);
  const setVisible = useStore(state => state.setBannedPopupVisible);
  const clearSession = useStore(state => state.clearSession);
  const router = useRouter();

  if (!isVisible) return null;

  const handleLogOut = async () => {
    setVisible(false);
    clearSession();
    await supabase.auth.signOut();
    router.replace('/');
  };

  const handleCloseApp = () => {
    if (Platform.OS === 'android') {
      BackHandler.exitApp();
    } else {
      handleLogOut();
    } // On iOS programmatic quitting isn't straightforward without crashing the app contextually, fallback to logout
  };

  return (
    <Modal
      transparent={true}
      visible={isVisible}
      animationType="fade"
      onRequestClose={() => {}} // ignore hardware back button dismissals 
    >
      <View style={styles.overlay}>
        <View style={styles.popup}>
          <Ionicons name="warning" size={48} color="#DC2626" style={styles.icon} />
          <Text style={styles.title}>Account Banned</Text>
          <Text style={styles.message}>
            Your account has been restricted due to violations. For inquiries or appeals, please contact:
          </Text>
          <Text style={styles.email}>jericho.dlsreyes@gmail.com</Text>
          
          <View style={styles.buttonContainer}>
            <TouchableOpacity style={styles.button} onPress={handleLogOut}>
              <Text style={styles.buttonText}>Log Out</Text>
            </TouchableOpacity>
            
            {Platform.OS === 'android' && (
              <TouchableOpacity style={[styles.button, styles.closeButton]} onPress={handleCloseApp}>
                <Text style={[styles.buttonText, styles.closeButtonText]}>Close App</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)', // Heavy darkening
    justifyContent: 'center',
    alignItems: 'center',
  },
  popup: {
    backgroundColor: '#FFF',
    borderRadius: 20,
    padding: 24,
    width: '85%',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
  icon: {
    marginBottom: 16,
  },
  title: {
    fontFamily: 'Inter',
    fontWeight: '700',
    fontSize: 20,
    color: '#1F2937',
    marginBottom: 8,
    textAlign: 'center',
  },
  message: {
    fontFamily: 'Inter',
    fontWeight: '400',
    fontSize: 14,
    color: '#4B5563',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 8,
  },
  email: {
    fontFamily: 'Inter',
    fontWeight: '700',
    fontSize: 14,
    color: '#2563EB',
    textAlign: 'center',
    marginBottom: 24,
  },
  buttonContainer: {
    width: '100%',
    gap: 12,
  },
  button: {
    backgroundColor: '#E8A020',
    borderRadius: 12,
    paddingVertical: 14,
    width: '100%',
    alignItems: 'center',
  },
  buttonText: {
    fontFamily: 'Inter',
    fontWeight: '600',
    fontSize: 16,
    color: '#1F2937',
  },
  closeButton: {
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  closeButtonText: {
    color: '#4B5563',
  },
});
