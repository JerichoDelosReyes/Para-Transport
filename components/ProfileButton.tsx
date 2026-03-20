import { TouchableOpacity, Text, StyleSheet, View, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { useStore } from '../store/useStore';
import { COLORS } from '../constants/theme';

function getInitials(name: string) {
  if (!name) return 'PR';
  const parts = name.split(' ');
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return name.substring(0, 2).toUpperCase();
}

export function ProfileButton() {
  const router = useRouter();
  const user = useStore((state) => state.user);

  // @ts-ignore - Check if photoUrl exists on user in the future
  const photoUrl = user?.photoUrl || user?.photo;

  return (
    <TouchableOpacity 
      style={styles.avatarButton} 
      onPress={() => router.push('/profile')}
      activeOpacity={0.8}
    >
      {photoUrl ? (
        <Image source={{ uri: photoUrl }} style={styles.avatarImage} />
      ) : (
        <Text style={styles.avatarInitials}>
          {getInitials(user?.name || '')}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  avatarButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.navy,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 18,
  },
  avatarInitials: {
    fontFamily: 'Inter',
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
