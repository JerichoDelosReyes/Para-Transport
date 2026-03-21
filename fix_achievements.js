const fs = require('fs');
let code = fs.readFileSync('app/achievements.tsx', 'utf8');
code = code.replace(/const BADGE_IMAGES.*?};/s, "import { BADGE_IMAGES } from '../constants/badgeImages';");
code = code.replace("backgroundColor: '#FFFFFF',", "backgroundColor: '#d5a944',");
fs.writeFileSync('app/achievements.tsx', code);
