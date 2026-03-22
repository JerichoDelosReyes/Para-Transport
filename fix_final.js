const fs = require('fs');

let indexCode = fs.readFileSync('app/(tabs)/index.tsx', 'utf-8');
indexCode = indexCode.replace(/width: 48,\s*height: 48,\s*borderRadius: 24,/, 'width: 60,\n    height: 60,\n    borderRadius: 30,');
indexCode = indexCode.replace(/backgroundColor: '#CBAB67',/, "backgroundColor: '#CBA962',\n    borderWidth: 3,\n    borderColor: '#FFFFFF',");
fs.writeFileSync('app/(tabs)/index.tsx', indexCode);

let aiCode = fs.readFileSync('app/ai-chatbot.tsx', 'utf-8');
aiCode = aiCode.replace(/<Ionicons name="language" size=\{20\} color=\{COLORS\.navy\} \/>\s*<Text style=\{styles\.actionText\}>Translate sign<\/Text>/, '<Ionicons name="scan" size={20} color={COLORS.navy} />\n            <Text style={styles.actionText}>Scan signboard</Text>');
fs.writeFileSync('app/ai-chatbot.tsx', aiCode);
