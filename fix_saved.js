const fs = require('fs');
let code = fs.readFileSync('app/(tabs)/saved.tsx', 'utf8');

code = code.replace(
  "const { user, removeSavedRoute, setSelectedTransitRoute, setPendingRouteSearch, sessionMode } = useStore();",
  "const { user, removeSavedRoute, removeSavedPlace, setSelectedTransitRoute, setPendingRouteSearch, sessionMode } = useStore();\n  const [activeTab, setActiveTab] = useState<'routes' | 'places'>('places');\n  const savedPlaces = user?.saved_places || [];"
);

code = code.replace(
  "const isGuestAccount = sessionMode === 'guest';",
  "const isGuestAccount = sessionMode === 'guest';"
);

code = code.replace(
  "      { text: 'Cancel', style: 'cancel' },",
  "      { text: 'Cancel', style: 'cancel' },"
);

code = code.replace(
  "  const confirmRemove = (id: number) => {",
  `  const confirmRemovePlace = (id: string) => {
    Alert.alert('Remove Saved Place', 'Are you sure you want to remove this place?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => removeSavedPlace(id) }
    ]);
  };

  const mapRouteToPlace = (place: any) => {
    setPendingRouteSearch({ 
      destination: place.title,
      destinationCoords: { latitude: place.coords[1], longitude: place.coords[0] }
    });
    router.navigate('/(tabs)');
  };

  const confirmRemove = (id: number) => {`
);

let insertHeaderBefore = `<ScrollView style={{ flex: 1, backgroundColor: theme.background }} contentContainerStyle={[styles.content, { paddingBottom: bottomPadding }]} showsVerticalScrollIndicator={false}>`;
let tabsHtml = `
      <View style={{ flexDirection: 'row', backgroundColor: isDark ? '#E8A020' : COLORS.primary, paddingHorizontal: 16 }}>
        <TouchableOpacity style={{ flex: 1, paddingVertical: 12, borderBottomWidth: 3, borderBottomColor: activeTab === 'routes' ? '#0A1628' : 'transparent', alignItems: 'center' }} onPress={() => setActiveTab('routes')}>
           <Text style={{ fontFamily: 'Cubao', fontSize: 18, color: activeTab === 'routes' ? '#0A1628' : 'rgba(10,22,40,0.5)' }}>ROUTES</Text>
        </TouchableOpacity>
        <TouchableOpacity style={{ flex: 1, paddingVertical: 12, borderBottomWidth: 3, borderBottomColor: activeTab === 'places' ? '#0A1628' : 'transparent', alignItems: 'center' }} onPress={() => setActiveTab('places')}>
           <Text style={{ fontFamily: 'Cubao', fontSize: 18, color: activeTab === 'places' ? '#0A1628' : 'rgba(10,22,40,0.5)' }}>PLACES</Text>
        </TouchableOpacity>
      </View>
      <ScrollView style={{ flex: 1, backgroundColor: theme.background }} contentContainerStyle={[styles.content, { paddingBottom: bottomPadding }]} showsVerticalScrollIndicator={false}>
`;
code = code.replace(insertHeaderBefore, tabsHtml);

let routesRender = `{isGuestAccount ? (`;
let routesRenderNew = `
        {isGuestAccount ? (
          <View style={[styles.emptyState, { backgroundColor: theme.cardBackground, borderColor: theme.cardBorder }]}>
            <JeepIllustration width={220} height={150} />
            <Text style={[styles.emptyTitle, { color: isDark ? '#FFFFFF' : '#0A1628' }]}>Sign in to save.</Text>
          </View>
        ) : activeTab === 'places' ? (
          savedPlaces.length === 0 ? (
            <View style={[styles.emptyState, { backgroundColor: theme.cardBackground, borderColor: theme.cardBorder }]}>
              <JeepIllustration width={220} height={150} />
              <Text style={[styles.emptyTitle, { color: isDark ? '#FFFFFF' : '#0A1628' }]}>Wala pang saved places.</Text>
            </View>
          ) : (
            savedPlaces.map((place: any, idx: number) => (
              <View key={place.id || idx} style={[styles.card, { backgroundColor: theme.cardBackground, borderColor: theme.cardBorder }]}>
                <View style={styles.cardTop}>
                  <Text style={[styles.routeName, { color: theme.text }]}>{place.title}</Text>
                  <TouchableOpacity onPress={() => confirmRemovePlace(place.id)}>
                    <Ionicons name="bookmark" size={18} color={COLORS.primary} />
                  </TouchableOpacity>
                </View>
                <Text style={[styles.legSummary, { color: theme.textSecondary }]}>{place.category || 'PLACE'}</Text>
                <View style={styles.cardBottom}>
                  <View style={{flex: 1}}/>
                  <TouchableOpacity style={[styles.ghostButton, { backgroundColor: theme.cardBackground, borderColor: isDark ? '#FFFFFF' : COLORS.navy }]} activeOpacity={0.9} onPress={() => mapRouteToPlace(place)}>
                    <Text style={[styles.ghostButtonText, { color: isDark ? '#FFFFFF' : COLORS.navy }]}>Directions</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )
        ) : savedRoutes.length === 0 ? (
          <View style={[styles.emptyState, { backgroundColor: theme.cardBackground, borderColor: theme.cardBorder }]}>
            <JeepIllustration width={220} height={150} />
            <Text style={[styles.emptyTitle, { color: isDark ? '#FFFFFF' : '#0A1628' }]}>Wala pang saved routes.</Text>
          </View>
        ) : (
          savedRoutes.map((route: any, idx: number) => (
`;

code = code.replace(
  `{isGuestAccount ? (
          <View style={[styles.emptyState, { backgroundColor: theme.cardBackground, borderColor: theme.cardBorder }]}>
            <JeepIllustration width={220} height={150} />
            <Text style={[styles.emptyTitle, { color: isDark ? '#FFFFFF' : '#0A1628' }]}>Sign in to save routes.</Text>
          </View>
        ) : savedRoutes.length === 0 ? (
          <View style={[styles.emptyState, { backgroundColor: theme.cardBackground, borderColor: theme.cardBorder }]}>
            <JeepIllustration width={220} height={150} />
            <Text style={[styles.emptyTitle, { color: isDark ? '#FFFFFF' : '#0A1628' }]}>Wala pang saved.</Text>
          </View>
        ) : (
          savedRoutes.map((route) => (`,
  routesRenderNew
);

code = code.replace(
  `          ))
        )}
      </ScrollView>`,
  `          ))
        )}
      </ScrollView>`
);


fs.writeFileSync('app/(tabs)/saved.tsx', code);
