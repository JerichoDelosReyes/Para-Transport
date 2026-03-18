const fs = require('fs');

const files = ['app/journey.tsx', 'app/journey-summary.tsx'];

for(let f of files) {
  if (fs.existsSync(f)) {
    let content = fs.readFileSync(f, 'utf8');

    // Safe area yellow background bleed
    content = content.replace(/screen: \{\s*flex: 1,\s*backgroundColor: COLORS.background,\s*\}/g,
`screen: {
    flex: 1,
    backgroundColor: COLORS.primary,
  }`);

    if (content.indexOf('flex: 1, backgroundColor: COLORS.background') === -1) {
       if(f.indexOf('journey.tsx') !== -1) {
         content = content.replace(/<View style=\{styles.mapMock\}>/,
           '<View style={{ flex: 1, backgroundColor: COLORS.background }}><View style={styles.mapMock}>');
         
         // Insert closing view right before the closing SafeAreaView
         content = content.replace(/<\/View>(\s*.*?)<\/SafeAreaView>/g, '</View></View>$1</SafeAreaView>'); 
       }
       
       if(f.indexOf('journey-summary.tsx') !== -1) {
         content = content.replace(/<View style=\{styles.content\}>/,
           '<View style={{ flex: 1, backgroundColor: COLORS.background }}><View style={styles.content}>');
         content = content.replace(/<\/View>(\s*.*?)<\/SafeAreaView>/, '</View></View>$1</SafeAreaView>'); 
       }
    }

    content = content.replace(/primaryButton: \{[\s\S]*?justifyContent: 'center',\n\s*\}/g,
`primaryButton: {
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
  }`);

    content = content.replace(/secondaryButton: \{[\s\S]*?justifyContent: 'center',\n\s*\}/g,
`secondaryButton: {
    height: 56,
    borderRadius: RADIUS.pill,
    borderWidth: 1.5,
    borderColor: '#EFEFEF',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  }`);
    
    content = content.replace(/ghostButton: \{[\s\S]*?justifyContent: 'center',\n\s*\}/g,
`ghostButton: {
    height: 56,
    borderRadius: RADIUS.pill,
    borderWidth: 1.5,
    borderColor: '#EFEFEF',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  }`);

    fs.writeFileSync(f, content);
  }
}
console.log('Journey updated');
