// Block fill / secondary / tertiary palettes for the Zelos renderer. The
// reference only shipped a single light palette and ignored the dark flag —
// we now branch on it so block bodies and chrome are legible on both themes.

const applyPalette = (palette) => {
  const Blockly = window.Blockly;
  if (!Blockly?.Colours) return;
  Object.assign(Blockly.Colours, palette);
};

const lightPalette = {
  RootBlock: { colour: "#2a3052", colourSecondary: "#2a3052", colourTertiary: "#6d7278" },
  Base: { colour: "#ffffff", colourSecondary: "#f4f4f5", colourTertiary: "#cfd2d4" },
  Special1: { colour: "#ffffff", colourSecondary: "#f7f8fa", colourTertiary: "#cfd2d4" },
  Special2: { colour: "#ffffff", colourSecondary: "#f7f8fa", colourTertiary: "#cfd2d4" },
  Special3: { colour: "#ffffff", colourSecondary: "#f7f8fa", colourTertiary: "#cfd2d4" },
  Special4: { colour: "#ffffff", colourSecondary: "#0e0e0e", colourTertiary: "#0e0e0e" },
};

const darkPalette = {
  RootBlock: { colour: "#3a4480", colourSecondary: "#3a4480", colourTertiary: "#9ea2a8" },
  Base: { colour: "#1f1f1f", colourSecondary: "#2a2a2a", colourTertiary: "#3a3a3a" },
  Special1: { colour: "#1f1f1f", colourSecondary: "#2a2a2a", colourTertiary: "#3a3a3a" },
  Special2: { colour: "#1f1f1f", colourSecondary: "#2a2a2a", colourTertiary: "#3a3a3a" },
  Special3: { colour: "#1f1f1f", colourSecondary: "#2a2a2a", colourTertiary: "#3a3a3a" },
  Special4: { colour: "#1f1f1f", colourSecondary: "#0e0e0e", colourTertiary: "#0e0e0e" },
};

export const setColors = (isDarkMode = false) => {
  applyPalette(isDarkMode ? darkPalette : lightPalette);
};
