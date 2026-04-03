sed -i '' -e '/const startGuidance = React\.useCallback/i\
  const stopGuidance = React.useCallback(() => {\
    Animated.timing(guidancePanY, {\
      toValue: -200,\
      duration: 300,\
      useNativeDriver: true\
    }).start(() => {\
      setIsGuidanceActive(false);\
      setGuidanceSteps([]);\
      setCurrentStepIndex(0);\
      setJourneySummaryData(null);\
    });\
  }, [guidancePanY]);\
' app/\(tabs\)/index.tsx
