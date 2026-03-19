import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SPACING, TYPOGRAPHY } from '../../constants/theme';
import { ProfileButton } from '../../components/ProfileButton';

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const bottomPadding = 60 + 36 + insets.bottom + 16;

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>HISTORY</Text>
        <ProfileButton />
      </View>

      <ScrollView 
        style={{ flex: 1, backgroundColor: COLORS.background }} 
        contentContainerStyle={[styles.content, { paddingBottom: bottomPadding }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No history yet.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.primary,
  },
  header: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.screenX,
    paddingVertical: 14,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 64,
  },
  headerTitle: {
    fontFamily: 'Cubao',
    fontSize: TYPOGRAPHY.screenTitle,
    color: COLORS.navy,
  },
  content: {
    padding: SPACING.screenX,
    paddingTop: 24,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 60,
  },
  emptyTitle: {
    fontFamily: 'Inter',
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.navy,
    marginTop: 20,
  },
});
