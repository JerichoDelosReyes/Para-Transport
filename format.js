const fs = require('fs');

// AI Chatbot Update
let botCode = fs.readFileSync('app/ai-chatbot.tsx', 'utf-8');

// Replace static gradient with theme gradient using COLORS if needed, or simply pure colors
// Replace header buttons and add useStore for name greeting
botCode = botCode.replace('import { LinearGradient } from "expo-linear-gradient";', `import { LinearGradient } from "expo-linear-gradient";
import { useStore } from "../store/useStore";
import { COLORS } from "../constants/theme";`);

botCode = botCode.replace('const floatAnim = useRef(new Animated.Value(0)).current;', `const floatAnim = useRef(new Animated.Value(0)).current;
  const user = useStore((state) => state.user);
  const firstName = user?.full_name?.split(" ")[0] || "Commuter";`);

botCode = botCode.replace('<Text style={styles.greetingTitle}>Hello, Commuter!</Text>', '{/* <Text style={styles.greetingTitle}>Hello, Commuter!</Text> */} <Text style={styles.greetingTitle}>Hello, {firstName}!</Text>');

botCode = botCode.replace('backgroundColor: "#000000",', 'backgroundColor: "#CBA962",'); // Fix Jeep background blending color approx to #CBA962 based on cropped asset image

// Remove settings button from header, wrap it around just the menu/back
const headerStr = `<View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.iconButton}>
            <Ionicons name="menu" size={24} color="#6B52AE" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconButton}>
            <Ionicons name="settings-sharp" size={22} color="#6B52AE" />
          </TouchableOpacity>
        </View>`;
        
const newHeaderStr = `<View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.iconButton}>
            <Ionicons name="menu" size={24} color="#5C479B" />
          </TouchableOpacity>
        </View>`;
        
botCode = botCode.replace(headerStr, newHeaderStr);

// Remove plus button
botCode = botCode.replace(`<TouchableOpacity style={styles.plusButton}>
              <Ionicons name="add" size={24} color="#6B52AE" />
            </TouchableOpacity>`, `{/* Extracted Plus Button */}`);

// Adjust Chatbot input / overall theme to match app theme more cohesively (if any color tuning is desired over default purple)
// User prompt: "...proceed on making the colors the same with the system"
// From constants/theme.ts: primary: '#F5C518', navy: '#0A1628', background: '#F8F3E8', text: '#1A1A2E'
// Update background gradient, accent shadows, button colors to tie better to the Para themes while maintaining floating/pastel ai feel
botCode = botCode.replace(`colors={["#D2E5FE", "#F6E4FB", "#D2F5F8"]}`, `colors={[COLORS.background, "#E6F0FA", "#F0EAF8"]}`);
botCode = botCode.replace(`color: "#6B52AE"`, `color: COLORS.navy`); // Map nav icons
botCode = botCode.replace(`color="#6B52AE"`, `color={COLORS.navy}`); // Replace specific explicit icon colors
botCode = botCode.replace(/color="#6B52AE"/g, 'color={COLORS.navy}'); 

botCode = botCode.replace(`backgroundColor: "#9575FF"`, `backgroundColor: COLORS.primary`); // Mic button to primary #F5C518
botCode = botCode.replace(`shadowColor: "#9C7CF6"`, `shadowColor: COLORS.navy`); // Mic shadow
botCode = botCode.replace(`color: "#342366"`, `color: COLORS.textStrong`); // Action texts

botCode = botCode.replace(`shadowColor: "#6B52AE"`, `shadowColor: COLORS.navy`); // Icon button shadow

botCode = botCode.replace(`shadowColor: "#9C7CF6"`, `shadowColor: COLORS.primary`); // Glow shadow
botCode = botCode.replace(`backgroundColor: "rgba(107, 82, 174, 0.2)"`, `backgroundColor: "rgba(10, 22, 40, 0.15)"`); // aiShadow 


fs.writeFileSync('app/ai-chatbot.tsx', botCode);

// Index FAB fix Jeep background color to cleanly cut off
let indexCode = fs.readFileSync('app/(tabs)/index.tsx', 'utf-8');
indexCode = indexCode.replace(/backgroundColor: '#000000',/g, "backgroundColor: '#CBAB67',");
fs.writeFileSync('app/(tabs)/index.tsx', indexCode);
