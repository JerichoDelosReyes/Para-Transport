import { useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useStore } from '../store/useStore';
import { COLORS, RADIUS, SPACING } from '../constants/theme';
import { supabase } from '../config/supabaseClient';

export default function EditProfileScreen() {
  const router = useRouter();
  const user = useStore((state) => state.user);
  const setUser = useStore((state) => state.setUser);
  
  const [name, setName] = useState(user?.name || '');
  const [isSaving, setIsSaving] = useState(false);
  
  const isGuestAccount = (user?.email || '').trim().toLowerCase() === 'guest@para.ph';

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Name cannot be empty.');
      return;
    }
    
    if (isGuestAccount) {
      Alert.alert('Guest Account', 'You cannot edit the profile of a guest account.');
      return;
    }

    setIsSaving(true);
    try {
      if (user?.email) {
        const { error } = await supabase
          .from('users')
          .update({ name: name.trim() })
          .eq('email', user.email);

        if (error) console.log('Supabase update failed:', error.message);
      }
      
      setUser({ ...user, name: name.trim() } as any);
      Alert.alert('Success', 'Profile updated successfully!', [
        { text: 'OK', onPress: () => router.back() }
      ]);
    } catch (err: any) {
      console.error('Error updating profile:', err);
      Alert.alert('Error', err.message || 'Failed to update profile.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <View style={styles.backButtonCircle}>
            <Ionicons name="chevron-back" size={24} color={COLORS.navy} />
          </View>
        </TouchableOpacity>
        
        <Text style={styles.headerTitle}>Edit Profile</Text>
        
        <TouchableOpacity 
          style={styles.saveButton}
          onPress={handleSave}
          disabled={isSaving}
        >
          {isSaving ? (
             <ActivityIndicator size="small" color={COLORS.primary} />
          ) : (
             <Text style={styles.saveText}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Full Name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Enter your full name"
            placeholderTextColor={COLORS.textMuted}
            editable={!isGuestAccount}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={[styles.input, styles.inputDisabled]}
            value={user?.email || ''}
            editable={false}
          />
        </View>
        
        {isGuestAccount && (
          <Text style={styles.guestNotice}>
            Profile cannot be modified for guest accounts.
          </Text>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.screenX,
    paddingVertical: 12,
    backgroundColor: COLORS.background,
  },
  backButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  backButtonCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: 'SFPro-Bold',
    fontSize: 20,
    color: '#1A1A2E',
  },
  saveButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  saveText: {
    fontFamily: 'Inter',
    fontWeight: '700',
    fontSize: 16,
    color: COLORS.primary,
  },
  content: {
    padding: SPACING.screenX,
    paddingTop: 24,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontFamily: 'Inter',
    fontWeight: '600',
    fontSize: 14,
    color: COLORS.textMuted,
    marginBottom: 8,
    marginLeft: 4,
  },
  input: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.input,
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontFamily: 'Inter',
    fontSize: 16,
    color: COLORS.navy,
  },
  inputDisabled: {
    backgroundColor: 'rgba(0,0,0,0.04)',
    color: COLORS.textMuted,
  },
  guestNotice: {
    fontFamily: 'Inter',
    fontSize: 14,
    color: COLORS.heavyText,
    marginTop: 10,
    textAlign: 'center',
  }
});