sed -i '' -e '/guidanceCard:/i\
  guidanceCloseBtn: {\
    position: "absolute",\
    top: 8,\
    right: 8,\
    zIndex: 10,\
    padding: 4,\
  },\
' app/\(tabs\)/index.tsx
