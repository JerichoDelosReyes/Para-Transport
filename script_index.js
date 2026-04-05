const fs = require('fs');

function themifyConfig(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');

  if (!content.includes('useTheme')) {
    content = content.replace(
      "import { COLORS, RADIUS, SPACING } from '../constants/theme';",
      "import { COLORS, RADIUS, SPACING } from '../constants/theme';\nimport { useTheme } from '../src/theme/ThemeContext';"
    );
  }

  // Inject hook
  content = content.replace(
    /(export default function [a-zA-Z]+\(.*\) \{\n)(\s*(const|let|var) )/,
    "$1  const { theme, isDark } = useTheme();\n  const styles = createStyles(theme, isDark);\n$2"
  );

  // Replace styles
  if(content.includes('const styles = StyleSheet.create({')) {
     content = content.replace('const styles = StyleSheet.create({', 'const createStyles = (theme: any, isDark: boolean) => StyleSheet.create({');
     content = content.replace(/COLORS\.background/g, 'theme.background');
     // Be careful with replacing COLORS.navy. For buttons we might want to keep the label #0A1628
     content = content.replace(/color:\s*COLORS\.navy/g, 'color: theme.text');
     content = content.replace(/color:\s*COLORS\.textMuted/g, 'color: theme.textSecondary');
     content = content.replace(/backgroundColor:\s*COLORS\.card/g, 'backgroundColor: theme.cardBackground');
     content = content.replace(/backgroundColor:\s*'#FFFFFF'/g, 'backgroundColor: theme.surface');
     content = content.replace(/backgroundColor:\s*COLORS\.primary/g, "backgroundColor: isDark ? '#E8A020' : COLORS.primary");
     content = content.replace(/color:\s*COLORS\.primary/g, "color: isDark ? '#E8A020' : COLORS.primary");
  }

  // Certain text inside the primary yellow button is COLORS.navy, replacing it with theme.text might make it white on yellow! Let's handle that.
  // Wait, `color: theme.text` was swapped. Let's fix the button text manually below.
  content = content.replace(/primaryButtonText: \{\s*([\s\S]*?)color: theme\.text,/g, 'primaryButtonText: {\n$1color: COLORS.navy,');
  content = content.replace(/modalPrimaryText: \{\s*([\s\S]*?)color: theme\.text,/g, 'modalPrimaryText: {\n$1color: COLORS.navy,');

  fs.writeFileSync(filePath, content, 'utf8');
}

['app/index.tsx', 'components/OtpModal.tsx'].forEach(themifyConfig);
