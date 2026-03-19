const fs = require('fs');

let content = fs.readFileSync('app/(tabs)/_layout.tsx', 'utf8');

// 1. Update TabBarBackground
content = content.replace(
  /function TabBarBackground\(\) \{[\s\S]*?return \([\s\S]*?<\/View>\);\n\}/,
`function TabBarBackground() {
  const insets = useSafeAreaInsets();
  const height = 56 + insets.bottom;
  const cx = width / 2;
  const notchWidth = 84;
  const depth = 22;

  const path = \`
    M 0,0 
    L \${cx - notchWidth/2},0
    C \${cx - notchWidth/4},0 \${cx - notchWidth/4},\${depth} \${cx},\${depth}
    C \${cx + notchWidth/4},\${depth} \${cx + notchWidth/4},0 \${cx + notchWidth/2},0
    L \${width},0
    L \${width},\${height}
    L 0,\${height}
    Z
  \`;

  return (
    <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height, backgroundColor: 'transparent', elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.1, shadowRadius: 4 }}>
      <Svg width={width} height={height}>
        <Path d={path} fill="#FFFFFF" />
let content = fs.readFi>
 
// 1. Update TabBarBackground
content = content.replace(
  /fuon content = content.replace(
 ep  /function TabBarBackgroty`function TabBarBackground() {
  const insets = useSafeAreaInsets();
  const'
  const insets = useSafeAreaI h  const height = 56 + insets.bottom;t.  const cx = width / 2;
  const noth\  const notchWidth = 812  const depth = 22;

   s
  const path on: 'ab    M 0,0 
    L\{    L \${ut    C \${cx - notchWidth/4},Ba    C \${cx + notchWidth/4},\${depth} \${cx + notchWidth/4},0 \${cx + notchWidi    L \${width},0
    L \${width},\${height}
    L 0,\${height}
    Z
  \`;

  returom  
  return (
        L 0,\${height}
    Z
'a    Z
  \`;

  re 0  \`ft
  r ri    <View>
      <Svg width={width} height={height}>
        <Path d={path} fill="#FFFFFF" />
let content = fs.readFi>
 
// 1. Update TabBarBackground
content = content.replace(
  /fuon content = content.replace(
 ep  /function TabBarBnt        <Path d={path} fill="#FFFFFF" />==let content = fs.readFi>
 
// 1. Update<V 
// 1. Update TabBarBastylcontent = content.replace(
 \}  /fuon content = contentyl ep  /function TabBarBackgroty*?<Li  const insets = useSafeAreaInsets();
  const'
  const inse\}  const'
  const insets = useSafeAreyl  contyle  const noth\  const notchWidth = 812  const depth = 22;

   s
  const path on: 'ab    M ute'
   s
  const path on: 'ab    M 0,0 
    L\{    L \${ut/Vi  c[\    L\{    L \${ut    C \${cxut    L \${width},\${height}
    L 0,\${height}
    Z
  \`;

  returom  
  return (
        L 0,\${height}
    Z
'a    Z
  \`;

  re 0  \`ft
  r he    L 0,\${height}
    Z
 }    Z
  \`;

  re    \`ex
  ryle  retyles.ta        L c    Z
'a    Z
  \`;

8A'a   :  \`ba(0
  r,0.  r ri    <        <Svg wid Ho        <Path d={path} fill="#FFFFFF" />  let content = fs.readFi>
 
// 1. UpdatehomeButtonWrapper, { bottom: content = content.replace(
 Li  /fuon content = contented ep  /function TabBarBnt        <
  
// 1. Update<V 
// 1. Update TabBarBastylcontent = content.replace(
 \}  /fuon content yles// 1. Update Tte \}  /fuon content = contentyl ep  /function TabBa{
  const'
  const inse\}  const'
  const insets = useSafeAreyl  contyle  const noth\  const notchWidthnt  conston  const insets = useSer
   s
  const path on: 'ab    M ute'
   s
  const path on: 'ab    M 0,0 
    L\{    L \${ut/Vust  cCo   s
  const path on: 'ab    '1  c',    L\{    L \${ut/Vi  c[\   re    L 0,\${height}
    Z
  \`;

  returom  
  return (
        L 0,\${height}
    xD    Z
  \`;

  re    \`ig
  rms:  return (
         LyC    Z
'a    Z
  \`;

n''a      \`;
gH
  ront  r he    L b    Z
 }    Z
  \`;

  ar }  ,
  \`;
);
  rnte  ryle  rett.'a    Z
  \`;

8A'a   :  \`ba(0
 [\  \`;
\}
8A'`ho  r,0.  r ri   :  
// 1. UpdatehomeButtonWrapper, { bottom: content = content.replace(
 Li  /fuon content = contented l sw Li  /fuon content = contented ep  /function TabBarBnt        <
  nt  
// 1. Update<V 
// 1. Update TabBarBastylcontent = content.ig/tR// 1. Update T \ \}  /fuon content yles// 1. Update Tte \}  /fuon t.  const'
  const insele.log('Fixed file');
