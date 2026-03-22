const fs = require('fs');
let code = fs.readFileSync('app/(tabs)/index.tsx', 'utf-8');
code = code.replace(/width: 48,
\s*height: 48,
\s*borderRadius: 24/, 'width: 60,
    height: 60,
    borderRadius: 30');
code = code.replace(/backgroundColor: '#CBAB67'/, 'backgroundColor: \'#CBA962\',
    borderWidth: 3,
    borderColor: \'#FFFFFF\'');
fs.writeFileSync('app/(tabs)/index.tsx', code);
let code2 = fs.readFileSync('app/ai-chatbot.tsx', 'utf-8');
code2 = code2.replace('name="language"', 'name="alert-circle"');
code2 = code2.replace('Translate sign', 'Report issue');
fs.writeFileSync('app/ai-chatbot.tsx', code2);
