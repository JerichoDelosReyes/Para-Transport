const fs = require('fs');

const loginPath = 'app/login.tsx';
let login = fs.readFileSync(loginPath, 'utf8');

login = login.replace(/primaryButton: \{[\s\S]*?justifyContent: 'center',\n\s*\}/,
`primaryButton: {
    marginTop: 16,
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

login = login.replace(/createAccountButton: \{[\s\S]*?justifyContent: 'center',\n\s*\}/,
`createAccountButton: {
    marginTop: 12,
    height: 54,
    borderRadius: RADIUS.pill,
    borderWidth: 1.5,
    borderColor: '#EFEFEF',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  }`);

login = login.replace(/appleSocial: \{[\s\S]*?\n\s*\}/,
`appleSocial: {
    flex: 1,
    height: 52,
    borderRadius: RADIUS.pill,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  }`);

login = login.replace(/lightSocial: \{[\s\S]*?\n\s*\}/g,
`lightSocial: {
    flex: 1,
    height: 52,
    borderRadius: RADIUS.pill,
    borderWidth: 1.5,
    borderColor: '#EFEFEF',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  }`);

login = login.replace(/input: \{[\s\S]*?color: COLORS.navy,\n\s*\}/,
`input: {
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#EFEFEF',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    fontFamily: 'Inter',
    fontSize: 17,
    color: COLORS.navy,
  }`);

login = login.replace(/passwordWrap: \{[\s\S]*?alignItems: 'center',\n\s*\}/,
`passwordWrap: {
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#EFEFEF',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
  }`);

fs.writeFileSync(loginPath, login);
console.log('Login updated');

const regPath = 'app/register.tsx';
let reg = fs.readFileSync(regPath, 'utf8');

reg = reg.replace(/primaryButton: \{[\s\S]*?alignItems: 'center',\n\s*\}/,
`primaryButton: {
    marginTop: 18,
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

reg = reg.replace(/input: \{[\s\S]*?color: COLORS.textStrong,\n\s*\}/,
`input: {
    height: 52,
    borderRadius: RADIUS.input,
    borderWidth: 1,
    borderColor: '#EFEFEF',
    marginTop: 8,
    backgroundColor: COLORS.card,
    paddingHorizontal: 14,
    fontFamily: 'Inter',
    fontSize: TYPOGRAPHY.body,
    color: COLORS.textStrong,
  }`);
  
reg = reg.replace(/passwordWrap: \{[\s\S]*?alignItems: 'center',\n\s*\}/,
`passwordWrap: {
    height: 52,
    borderRadius: RADIUS.input,
    borderWidth: 1,
    borderColor: '#EFEFEF',
    marginTop: 8,
    backgroundColor: COLORS.card,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
  }`);

// Make register screen header safe area yellow to match login
reg = reg.replace(/screen: \{\s*flex: 1,\s*backgroundColor: COLORS.background,\s*\}/, 
`screen: {
    flex: 1,
    backgroundColor: COLORS.primary,
  }`);

if (reg.includes("<ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>") && !reg.includes("style={{ backgroundColor: COLORS.background }}")) {
    reg = reg.replace(
        "<ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>",
        "<ScrollView style={{ backgroundColor: COLORS.background }} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>"
    );
}

fs.writeFileSync(regPath, reg);
console.log('Register updated');

const tabs = ['app/(tabs)/index.tsx', 'app/(tabs)/fare.tsx', 'app/(tabs)/planner.tsx', 'app/(tabs)/profile.tsx'];
for(const tab of tabs) {
  let content = fs.readFileSync(tab, 'utf8');
  content = content.replace(/screen: \{\s*flex: 1,\s*backgroundColor: COLORS.background,\s*\}/g,
`screen: {
    flex: 1,
    backgroundColor: COLORS.primary,
  }`);

  content = content.replace(/header: \{\s*backgroundColor: COLORS.background,/g,
`header: {
    backgroundColor: COLORS.primary,`);

  // Ensure scrollviews/content views have the right background color explicitly
  if (content.includes('showsVerticalScrollIndicator={false}>') && !content.includes('style={{ flex: 1, backgroundColor: COLORS.background }}')) {
     content = content.replace(/<ScrollView contentContainerStyle=\{styles.content\} showsVerticalScrollIndicator=\{false\}>/g,
       '<ScrollView style={{ flex: 1, backgroundColor: COLORS.background }} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>');
  } 
  
  if (content.includes('<View style={styles.content}>') && !content.includes('backgroundColor: COLORS.background')) {
     content = content.replace(/<View style=\{styles.content\}>/g, '<View style={[styles.content, { flex: 1, backgroundColor: COLORS.background }]}>');
  }

  content = content.replace(/button: \{\s*height: 56,[\s\S]*?justifyContent: 'center',\n\s*\}/,
`button: {
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

  fs.writeFileSync(tab, content);
}
console.log('Tabs updated');