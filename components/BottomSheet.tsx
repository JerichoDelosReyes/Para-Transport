import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Animated,
  PanResponder,
  type ViewStyle,
  type StyleProp,
} from 'react-native';
import { COLORS } from '../constants/theme';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
export const DEFAULT_FULL_HEIGHT = SCREEN_HEIGHT * 0.8;
export const DEFAULT_HALF_HEIGHT = SCREEN_HEIGHT * 0.45;

type BottomSheetProps = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  snapPoints?: { full: number; half: number };
  contentContainerStyle?: StyleProp<ViewStyle>;
  disableHeaderBorder?: boolean;
};

export default function BottomSheet({
  visible,
  onClose,
  title,
  children,
  snapPoints = { full: DEFAULT_FULL_HEIGHT, half: DEFAULT_HALF_HEIGHT },
  contentContainerStyle,
  disableHeaderBorder = false,
}: BottomSheetProps) {
  const panY = useRef(new Animated.Value(0)).current;
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    if (visible) {
      setIsExpanded(false);
      Animated.spring(panY, {
        toValue: -snapPoints.half,
        tension: 60,
        friction: 12,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(panY, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, panY, snapPoints.half]);

  const handleDismissSpring = () => {
    Animated.timing(panY, {
      toValue: 0,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      onClose();
    });
  };

  const toggleExpand = () => {
    const nextY = isExpanded ? -snapPoints.half : -snapPoints.full;
    Animated.spring(panY, {
      toValue: nextY,
      tension: 60,
      friction: 12,
      useNativeDriver: true,
    }).start(() => setIsExpanded(!isExpanded));
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_, gestureState) => Math.abs(gestureState.dy) > 10,
        onPanResponderGrant: () => {
          panY.extractOffset();
        },
        onPanResponderMove: Animated.event([null, { dy: panY }], {
          useNativeDriver: false,
        }),
        onPanResponderRelease: (_, gestureState) => {
          panY.flattenOffset();

          if (gestureState.dy > 80) {
            handleDismissSpring();
          } else if (gestureState.dy < -50) {
            Animated.spring(panY, {
              toValue: -snapPoints.full,
              tension: 60,
              friction: 12,
              useNativeDriver: true,
            }).start(() => setIsExpanded(true));
          } else {
            Animated.spring(panY, {
              toValue: isExpanded ? -snapPoints.full : -snapPoints.half,
              tension: 60,
              friction: 12,
              useNativeDriver: true,
            }).start();
          }
        },
      }),
    [isExpanded, panY, snapPoints.full, snapPoints.half],
  );

  return (
    <Animated.View
      style={[
        styles.sheetContainer,
        {
          height: snapPoints.full,
          bottom: -snapPoints.full,
          transform: [{ translateY: panY }],
        },
      ]}
      pointerEvents={visible ? 'auto' : 'none'}
    >
      <View
        style={[
          styles.sheetHeader,
          disableHeaderBorder && { borderBottomWidth: 0 },
        ]}
        {...panResponder.panHandlers}
      >
        <TouchableOpacity style={styles.dragHandleWrap} onPress={toggleExpand} activeOpacity={0.9}>
          <View style={styles.dragHandle} />
        </TouchableOpacity>
        {title ? (
          <View style={styles.sheetHeaderRow}>
            <Text style={styles.sheetHeaderTitle}>{title}</Text>
          </View>
        ) : null}
      </View>

      <View style={[styles.contentContainer, contentContainerStyle]}>{children}</View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheetContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
    paddingTop: 8,
    zIndex: 100,
  },
  sheetHeader: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(10,22,40,0.06)',
    backgroundColor: 'transparent',
  },
  dragHandleWrap: {
    alignItems: 'center',
    paddingBottom: 12,
    paddingTop: 8,
    width: '100%',
  },
  dragHandle: {
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: COLORS.primary,
  },
  sheetHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sheetHeaderTitle: {
    fontFamily: 'Cubao',
    fontSize: 24,
    color: COLORS.navy,
    letterSpacing: 0.5,
  },
  contentContainer: {
    flex: 1,
  },
});