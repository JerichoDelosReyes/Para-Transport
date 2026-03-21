const fs = require('fs');

let code = fs.readFileSync('app/profile.tsx', 'utf8');

if (!code.includes('BADGE_IMAGES')) {
  code = code.replace("import { BADGES } from '../constants/badges';", "import { BADGES } from '../constants/badges';\nimport { BADGE_IMAGES } from '../constants/badgeImages';");
}

const replacement = `                  <View style={styles.profileIconWrapper}>
                    {BADGE_IMAGES[badge.id] ? (
                      <Image 
                        source={BADGE_IMAGES[badge.id]} 
                        style={[styles.badgeImage, !isEarned && { opacity: 0.3 }]} 
                        resizeMode="contain" 
                      />
                    ) : (
                      <Text style={[styles.badgeEmoji, !isEarned && { opacity: 0.3 }]}>{badge.icon}</Text>
                    )}
                  </View>`;

code = code.replace(
  /<Text style={\[styles\.badgeEmoji, !isEarned && { opacity: 0\.3 }\].*?<\/Text>/s,
  replacement
);

if (!code.includes('profileIconWrapper: {')) {
  code = code.replace(
    "badgeLocked: {",
    "profileIconWrapper: {\n    width: 50,\n    height: 50,\n    borderRadius: 25,\n    backgroundColor: '#d5a944',\n    justifyContent: 'center',\n    alignItems: 'center',\n    marginBottom: 8,\n  },\n  badgeImage: {\n    width: 35,\n    height: 35,\n  },\n  badgeLocked: {"
  );
}

// ensure badgeEmoji removes its marginBottom because the wrapper has it now
code = code.replace(
  /badgeEmoji: {\s*fontSize: 32,\s*marginBottom: 8,\s*},/s,
  "badgeEmoji: {\n    fontSize: 32,\n  },"
);

fs.writeFileSync('app/profile.tsx', code);
