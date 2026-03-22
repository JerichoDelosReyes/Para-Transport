const fs = require('fs');

let content = fs.readFileSync('app/(tabs)/routes.tsx', 'utf8');

const replacement = `        ) : user.commute_history && user.commute_history.length > 0 ? (
          <View style={{ paddingTop: 20 }}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>RECENT ROUTES</Text>
            </View>
            <View style={{ gap: 12 }}>
              {user.commute_history.map((item: any, index: number) => {
                const isSaved = user.saved_routes?.some((r: any) => 
                  r.legs && r.legs[0]?.from?.lat === item.origin?.lat && r.legs[0]?.to?.lat === item.destination?.lat
                );
                return (
                  <TouchableOpacity
                    key={item.id || index}
                    style={[styles.routeCard, { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, padding: 16, borderRadius: RADIUS.card, gap: 12 }]}
                    activeOpacity={0.7}
                    onPress={() => {
                        useStore.getState().setPendingRouteSearch({ origin: item.origin || null, destination: item.destination });
                        router.replace('/(tabs)/index');
                    }}
                  >
                    <View style={{ backgroundColor: '#F0F9FF', padding: 8, borderRadius: 12 }}>
                      <Ionicons name="time-outline" size={24} color="#0EA5E9" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: 'Inter', fontWeight: '600', fontSize: 16, color: COLORS.navy }} numberOfLines={1}>
                        {item.origin?.name || 'Current Location'}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 2 }}>
                        <Ionicons name="arrow-down-outline" size={14} color={COLORS.textMuted} />
                      </View>
                      <Text style={{ fontFamily: 'Inter', fontWeight: '600', fontSize: 16, color: COLORS.navy }} numberOfLines={1}>
                        {item.destination?.name || 'Unknown'}
                      </Text>
                      <Text style={{ fontFamily: 'Inter', fontSize: 12, color: COLORS.textMuted, marginTop: 4 }}>
                        {new Date(item.timestamp).toLocaleDateString()} at {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </View>
                    <TouchableOpacity
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      onPress={() => {
                        if (!isSaved) {
                          useStore.getState().saveRoute({
                            id: Date.now(),
                            name: \`\${item.origin?.name || 'Current Location'} to \${item.destination?.name || 'Unknown'}\`,
                            legs: [{ mode: 'Custom Route', from: item.origin || null, to: item.destination }],
                            total_fare: 0,
                          });
                          Alert.alert('Saved', 'Route has been added to your Saved page.');
                        }
                      }}
                    >
                      <Ionicons name={isSaved ? "heart" : "heart-outline"} size={26} color={isSaved ? "#E11D48" : COLORS.textMuted} />
                    </TouchableOpacity>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ) : (`;

const parts = content.split('        ) : (');
if (parts.length > 1) {
  const rest = parts.slice(1).join('        ) : (');
  // We want to replace the first `) : (` with our condition and let the rest fall through to the empty state.
  content = parts[0] + replacement + rest;
}

fs.writeFileSync('app/(tabs)/routes.tsx', content, 'utf8');
