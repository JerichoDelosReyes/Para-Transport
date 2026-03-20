import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '../constants/theme';
import { useStore } from '../store/useStore';

export default function ActiveJourneyScreen() {
  const router = useRouter();
  const route = useStore((state) => state.activeJourneyRoute);
  const originLabel = useStore((state) => state.activeJourneyOriginLabel);
  const destinationLabel = useStore((state) => state.activeJourneyDestinationLabel);
  const stepIndex = useStore((state) => state.activeJourneyStepIndex);
  const advanceJourneyStep = useStore((state) => state.advanceJourneyStep);
  const clearActiveJourneyPlan = useStore((state) => state.clearActiveJourneyPlan);

  if (!route) {
    return (
      <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
        <View style={{ flex: 1, backgroundColor: COLORS.background }}>
          <View style={styles.mapMock}>
            <Ionicons name="alert-circle" size={72} color="rgba(10,22,40,0.3)" />
            <Text style={styles.legMeta}>No active journey loaded.</Text>
          </View>
          <View style={styles.bottomCard}>
            <TouchableOpacity style={styles.primaryButton} onPress={() => router.replace('/(tabs)/planner')} activeOpacity={0.9}>
              <Text style={styles.primaryText}>Back To Planner</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const directions = route.directions.length ? route.directions : ['Proceed to destination'];
  const currentInstruction = directions[Math.min(stepIndex, directions.length - 1)];
  const isLastStep = stepIndex >= directions.length - 1;
  const currentLeg = route.legs[Math.min(stepIndex, route.legs.length - 1)];

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={{ flex: 1, backgroundColor: COLORS.background }}><View style={styles.mapMock}>
        <Ionicons name="map" size={96} color="rgba(10,22,40,0.2)" />
        <Text style={styles.legMeta}>{originLabel || 'Origin'} to {destinationLabel || 'Destination'}</Text>
      </View>

      <View style={styles.bottomCard}>
        <View style={styles.row}>
          <View style={styles.modeIconWrap}>
            <Ionicons name="bus" size={22} color={COLORS.navy} />
          </View>
          <View style={styles.legTextWrap}>
            <Text style={styles.legTitle}>Step {Math.min(stepIndex + 1, directions.length)} of {directions.length}</Text>
            <Text style={styles.legMeta}>{currentInstruction}</Text>
            {currentLeg ? (
              <Text style={styles.legMeta}>{currentLeg.signboard} • {currentLeg.boardAt} to {currentLeg.alightAt}</Text>
            ) : null}
          </View>
        </View>

        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => {
              if (isLastStep) {
                router.push('/journey-summary');
                return;
              }

              advanceJourneyStep();
            }}
            activeOpacity={0.9}
          >
            <Text style={styles.primaryText}>{isLastStep ? 'View Summary' : 'Next Step'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.ghostButton}
            onPress={() => {
              clearActiveJourneyPlan();
              router.replace('/(tabs)/planner');
            }}
            activeOpacity={0.9}
          >
            <Text style={styles.ghostText}>End Journey</Text>
          </TouchableOpacity>
        </View>
      </View></View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.primary,
  },
  mapMock: {
    flex: 1,
    backgroundColor: '#EFE8D0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomCard: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: COLORS.card,
    borderTopWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    paddingHorizontal: SPACING.screenX,
    paddingTop: 16,
    paddingBottom: 20,
    gap: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  modeIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFF5CC',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  legTextWrap: {
    flex: 1,
  },
  legTitle: {
    fontFamily: 'Cubao',
    fontSize: 26,
    color: COLORS.navy,
  },
  legMeta: {
    fontFamily: 'Inter',
    fontSize: TYPOGRAPHY.label,
    color: COLORS.textLabel,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: SPACING.cardGap,
  },
  primaryButton: {
    flex: 1,
    height: 56,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.14,
    shadowRadius: 10,
    elevation: 6,
  },
  primaryText: {
    fontFamily: 'Inter',
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.navy,
  },
  ghostButton: {
    flex: 1,
    height: 56,
    borderRadius: RADIUS.pill,
    borderWidth: 1.5,
    borderColor: '#EFEFEF',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostText: {
    fontFamily: 'Inter',
    fontSize: TYPOGRAPHY.body,
    fontWeight: '600',
    color: COLORS.navy,
  },
});
