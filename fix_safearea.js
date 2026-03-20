const fs = require('fs');
const file = 'components/SearchScreen.tsx';
let code = fs.readFileSync(file, 'utf8');

// remove SafeAreaView from react-native import
code = code.replace("SafeAreaView,\n  Alert,", "Alert,");

// add safe-area-context
code = code.replace("} from 'react-native';", "} from 'react-native';\nimport { SafeAreaView } from 'react-native-safe-area-context';");

// put edges back
code = code.replace("<SafeAreaView style={styles.safe}>", "<SafeAreaView style={styles.safe} edges={['top']}>");

fs.writeFileSync(file, code);
