const fs = require('fs');

function themifyForms(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');

  // Fix hook injection - we want to ensure `const styles = createStyles(theme, isDark);` is present right after useTheme
  // The forms already have `const { theme, isDark } = useTheme();` inside them.
  if (!content.includes('const styles = createStyles(theme, isDark);')) {
    content = content.replace(/(const \{ theme, isDark \} = useTheme\(\);\n)/, "$1  const styles = createStyles(theme, isDark);\n");
  }

  // Rewrite StyleSheet.create to createStyles if not done yet
  if(content.includes('const styles = StyleSheet.create({')) {
     content = content.replace('const styles = StyleSheet.create({', 'const createStyles = (theme: any, isDark: boolean) => StyleSheet.create({');
     
     content = content.replace(/COLORS\.background/g, 'theme.background');
     // For buttons or text that are COLORS.navy within the primary button, keep it as #0A1628
     // Otherwise convert text to theme variables
     content = content.replace(/color:\s*COLORS\.navy/g, 'color: theme.text');
     content = content.replace(/color:\s*COLORS\.textMuted/g, 'color: theme.textSecondary');
     content = content.replace(/color:\s*COLORS\.textLabel/g, 'color: theme.textSecondary');
     content = content.replace(/color:\s*COLORS\.textStrong/g, 'color: theme.text');
     
     content = content.replace(/backgroundColor:\s*COLORS\.card/g, 'backgroundColor: theme.cardBackground');
     content = content.replace(/backgroundColor:\s*'#FFFFFF'/g, 'backgroundColor: theme.surface');
     
     // IMPORTANT requested replacement for Yellow: primary color to #E8A020 in Dark Mode
     content = content.replace(/backgroundColor:\s*COLORS\.primary/g, "backgroundColor: isDark ? '#E8A020' : COLORS.primary");
     content = content.replace(/color:\s*COLORS\.primary/g, "color: isDark ? '#E8A020' : COLORS.primary");
     content = content.replace(/borderColor:\s*COLORS\.primary/g, "borderColor: isDark ? '#E8A020' : COLORS.primary");
     
     // Special overrides: primaryButtonText needs to be explicitly Navy for high contrast against the Yellow/Orange button surface
     content = content.replace(/(primaryButtonText: \{[\s\S]*?)color:\s*theme\.text/g, "$1color: '#0A1628'");
     content = content.replace(/(title: \{[\s\S]*?)color:\s*theme\.text/g, "$1color: theme.text");
     content = content.replace(/(headerCopy: \{[\s\S]*?)color:\s*theme\.text/g, "$1color: theme.text");
     content = content.replace(/(modalTitle: \{[\s\S]*?)color:\s*theme\.text/g, "$1color: theme.text");
  }

  fs.writeFileSync(filePath, content, 'utf8');
}

// Ensure the modal works for the loader icon too. Let's do that manually later if needed.
['app/login.tsx', 'app/register.tsx'].forEach(themifyForms);
