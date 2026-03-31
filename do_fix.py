
import re

with open('app/(tabs)/index.tsx', 'r') as f:
    content = f.read()

# Aggressive replace of toRecommenderOptions and buildRecommendationOptions
content = re.sub(r'const toRecommenderOptions = \([\s\S]*?^};', '', content, flags=re.MULTILINE)
content = re.sub(r'const buildRecommendationOptions = \([\s\S]*?^};', '', content, flags=re.MULTILINE)
content = re.sub(r'const isWalkOnlyCandidate = \([\s\S]*?^};', '', content, flags=re.MULTILINE)
content = re.sub(r'const dominantMode = \([\s\S]*?^};', '', content, flags=re.MULTILINE)
content = re.sub(r'const isExclusiveMode = \([\s\S]*?^};', '', content, flags=re.MULTILINE)
content = re.sub(r'const pickPoolByPriority = \([\s\S]*?^};', '', content, flags=re.MULTILINE)
content = re.sub(r'const isCvsuImusTarget = \([\s\S]*?^};', '', content, flags=re.MULTILINE)

# Remove old polyline usages for selectedRouteLegs
content = re.sub(r'\{selectedRouteLegs\.map\(\(leg, i\) => \([\s\S]*?\{/\* End Transit Leg \*/\}', '', content, flags=re.MULTILINE)

# Strip out recommenderOptions maps from the sheet content or whatever is still left
content = re.sub(r'\{recommenderOptions\.length > 0 && \([\s\S]*?\}\)', '', content, flags=re.MULTILINE)

# Replace remaining selectedRecommenderOptionId variables if any
content = re.sub(r'selectedRecommenderOptionId === o\.id', 'false', content)

# Remove {selectedOptionLabel}
content = re.sub(r'\{selectedOptionLabel\}', '', content)

with open('app/(tabs)/index.tsx', 'w') as f:
    f.write(content)
