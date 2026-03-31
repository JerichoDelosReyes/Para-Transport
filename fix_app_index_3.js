const fs = require('fs');
let content = fs.readFileSync('app/(tabs)/index.tsx', 'utf-8');

content = content.replace(/const selectedOptionLabel = useMemo\([\s\S]*?\]\);/g, '');
content = content.replace(/setRecommenderCandidates\(\[\]\);\s*/g, '');
content = content.replace(/setRecommenderOptions\(\[\]\);\s*/g, '');
content = content.replace(/setSelectedRecommenderOptionId\(null\);\s*/g, '');
content = content.replace(/setSelectedRouteLegs\(\[\]\);\s*/g, '');
content = content.replace(/const handleSelectRecommenderOption = useCallback\([\s\S]*?\}, \[recommenderCandidates\]\);/g, '');

content = content.replace(/const builtCandidates = buildRecommendationOptions[\s\S]*?edgePadding: { top: 120, right: 40, bottom: 220, left: 40 },\s+animated: true,\s+}\);\s+}/g, '');

fs.writeFileSync('app/(tabs)/index.tsx', content);
