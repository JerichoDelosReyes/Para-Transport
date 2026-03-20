const fs = require('fs');
const file = 'components/SearchScreen.tsx';
let code = fs.readFileSync(file, 'utf8');

// 1. Add Modal import
code = code.replace(/import \{([\s\S]*?)View,\s*Text/m, "import {\n  Modal,\n  View,\n  Text");

// 2. Wrap return with Modal
code = code.replace(/return \(\n\s*<View style={styles\.container}>/, "return (\n    <Modal visible={visible} animationType=\"slide\" transparent={false} onRequestClose={onClose}>\n      <View style={styles.container}>");
code = code.replace(/<\/SafeAreaView>\n\s*<\/View>\n\s*\);\n}/, "</SafeAreaView>\n      </View>\n    </Modal>\n  );\n}");

// 3. Remove "if (!visible) return null;"
code = code.replace("if (!visible) return null;", "");

// 4. Update fields to have Microphone and fixed TextInput for origin.
// Also add 'Choose Current Location' button.

fs.writeFileSync(file, code);
